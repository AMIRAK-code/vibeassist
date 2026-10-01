import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

// Session, profile and plan of the signed-in user (provided by AuthProvider)
export function useAuth() {
  return useContext(AuthContext);
}
