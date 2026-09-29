import { PageHeader, Notice, SampleBadge } from "../components/UI";
export default function AdManager() {
  return (
    <div className="stack">
      <PageHeader
        title="Advertising"
        description="Explore how campaign performance could fit alongside your product metrics."
      >
        <SampleBadge />
      </PageHeader>
      <Notice>
        <strong>No advertising accounts are connected.</strong>
        <p>
          This is an illustrative campaign breakdown. Live campaign management,
          spending changes, and ad optimization are not available.
        </p>
      </Notice>
      <section className="glass-panel">
        <h2>Sample campaign spend</h2>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Sample advertising spend"
        >
          <table>
            <caption>Illustrative dataset · no live reporting period</caption>
            <thead>
              <tr>
                <th scope="col">Network</th>
                <th scope="col">Sample spend (USD)</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["YouTube", 550],
                ["TikTok", 1200],
                ["Meta", 2500],
                ["X", 0],
              ].map(([name, amount]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>${amount.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>$4,250</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section className="glass-panel">
        <h2>Before you compare campaigns</h2>
        <p className="muted mt-4">
          Use the same reporting period and attribution definition across
          networks. Spend alone does not tell you whether a campaign is
          profitable.
        </p>
      </section>
    </div>
  );
}
