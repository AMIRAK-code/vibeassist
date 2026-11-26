import { createClient } from '@supabase/supabase-js';
import {
  activateSuperuserSession,
  deactivateSuperuserSession,
  getSuperuserSession,
  getSuperuserUser,
  isLocalHandoffToken,
  isSuperuserActive,
  isSuperuserCredentials,
  isSuperuserLogin,
  onSuperuserAuthChange,
  superuserCallFunction,
  superuserFrom,
  superuserRpc,
} from './superuserSandbox';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const realClient = url && publishableKey ? createClient(url, publishableKey) : null;

function buildWrappedClient(client) {
  if (!client) return null;

  const wrappedAuth = new Proxy(client.auth, {
    get(target, prop) {
      if (prop === 'getSession') {
        return async () => {
          if (isSuperuserActive()) {
            return { data: { session: getSuperuserSession() }, error: null };
          }
          return target.getSession();
        };
      }
      if (prop === 'onAuthStateChange') {
        return (callback) => {
          const realSub = target.onAuthStateChange((event, next) => {
            if (!isSuperuserActive()) callback(event, next);
          });
          const localSub = onSuperuserAuthChange(callback);
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  realSub.data.subscription.unsubscribe();
                  localSub.data.subscription.unsubscribe();
                },
              },
            },
          };
        };
      }
      if (prop === 'signInWithPassword') {
        return async ({ email, password }) => {
          if (isSuperuserCredentials(email, password)) {
            const session = activateSuperuserSession();
            return { data: { user: getSuperuserUser(), session }, error: null };
          }
          if (isSuperuserLogin(email)) {
            return {
              data: { user: null, session: null },
              error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
            };
          }
          return target.signInWithPassword({ email, password });
        };
      }
      if (prop === 'signOut') {
        return async (options) => {
          if (isSuperuserActive()) {
            deactivateSuperuserSession();
            return { error: null };
          }
          return target.signOut(options);
        };
      }
      if (prop === 'resetPasswordForEmail') {
        return async (email, options) => {
          if (isSuperuserActive() || isSuperuserLogin(email)) {
            return { data: {}, error: null };
          }
          return target.resetPasswordForEmail(email, options);
        };
      }
      if (prop === 'updateUser') {
        return async (attributes) => {
          if (isSuperuserActive()) {
            return { data: { user: getSuperuserUser() }, error: null };
          }
          return target.updateUser(attributes);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'auth') return wrappedAuth;
      if (prop === 'from') {
        return (table) => (isSuperuserActive() ? superuserFrom(table) : target.from(table));
      }
      if (prop === 'rpc') {
        return (fn, args) => ((isSuperuserActive() || (fn === 'get_shared_handoff' && isLocalHandoffToken(args?.p_token)))
          ? superuserRpc(fn, args)
          : target.rpc(fn, args));
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

// When .env.local is missing, App shows setup instructions instead of crashing
export const supabase = buildWrappedClient(realClient);
export const supabaseUrl = url;
export const supabasePublishableKey = publishableKey;

// Supabase errors carry a message meant for developers; keep the UI wording friendly
export function friendlyError(error, fallback = 'Something went wrong. Try again.') {
  if (!error) return fallback;
  if (error.name === 'FunctionsHttpError' || error.name === 'FunctionsRelayError') return fallback;
  return error.message || fallback;
}

// Calls an Edge Function and returns its JSON body, even for error statuses.
// Pass an AbortSignal to stop waiting; the result is then { aborted: true }.
export async function callFunction(name, body, { signal } = {}) {
  if (isSuperuserActive()) {
    return superuserCallFunction(name, body, { signal }, realClient);
  }
  const { data, error } = await supabase.functions.invoke(name, { body, signal });
  if (signal?.aborted) return { aborted: true, data: null, status: 0 };
  if (!error) return { data, status: 200 };
  if (error.name === 'FunctionsFetchError') {
    return { data: { error: "Couldn't reach the server. Check your connection and try again." }, status: 0 };
  }
  const response = error.context;
  if (response && typeof response.json === 'function') {
    try {
      return { data: await response.json(), status: response.status };
    } catch {
      // not JSON; fall through
    }
  }
  return { data: { error: friendlyError(error) }, status: response?.status ?? 500 };
}
