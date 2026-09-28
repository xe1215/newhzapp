import React from "react";
import { Link } from "react-router-dom";
import { PRODUCT_TAG_GROUPS } from "../constants/admin-shell";

export default function TagsPage() {
  return <section className="module-panel">
    <header className="module-header overview-header"><div>
      <p className="module-eyebrow">商品标签</p><h2>商品标签</h2>
      <p className="module-copy">查看商品标签白名单；编辑商品标签请前往口红库。</p>
    </div></header>
    <div className="library-layout">
      <section className="subpanel"><h3>标签字典</h3>
        <div className="table-shell"><table className="record-table"><thead><tr><th>标签组</th><th>可选值</th></tr></thead>
          <tbody>{Object.entries(PRODUCT_TAG_GROUPS).map(([key, group]) => <tr key={key}><td>{group.label}</td><td>{group.options.join("、")}</td></tr>)}</tbody>
        </table></div>
      </section>
      <section className="subpanel"><h3>商品维护</h3><Link to="/lipsticks" className="ghost-button light-ghost">前往口红库编辑标签</Link></section>
    </div>
  </section>;
}
