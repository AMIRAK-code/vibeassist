import { ExternalLink } from "lucide-react";
import { PageHeader } from "../components/UI";
export default function Newsletter() {
  return (
    <div className="stack">
      <PageHeader
        title="News & learning"
        description="Go directly to the sources for platform announcements and developer learning."
      />
      <div className="grid-3">
        {[
          {
            name: "Apple Developer News",
            text: "App Store and Apple platform announcements.",
            url: "https://developer.apple.com/news/",
          },
          {
            name: "Android Developers Blog",
            text: "Android development and platform updates.",
            url: "https://android-developers.googleblog.com/",
          },
          {
            name: "Stripe Blog",
            text: "Payments, products, and business insights from Stripe.",
            url: "https://stripe.com/blog",
          },
        ].map((source) => (
          <article className="glass-panel resource-card" key={source.url}>
            <h2>{source.name}</h2>
            <p>{source.text}</p>
            <a href={source.url} target="_blank" rel="noreferrer">
              Visit source <ExternalLink size={16} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </article>
        ))}
      </div>
      <section className="glass-panel">
        <h2>The Weekly Vibe</h2>
        <p className="muted mt-4">
          Email subscriptions are not available yet. In the meantime, explore
          the sources above. No email address is collected here.
        </p>
      </section>
    </div>
  );
}
