import React from "react";

export function RecordWorkbenchLayout({ left, right, extraClassName = "library-layout" }) {
  return <div className={extraClassName}>{left}{right}</div>;
}

export function RecordTableSection({ title, children }) {
  return (
    <section className="subpanel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function RecordDetailSection({ title, actions, loading, emptyText, hasSelection, children }) {
  return (
    <section className="subpanel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
        </div>
        {actions || null}
      </div>
      {loading ? <p className="module-copy">正在加载详情...</p> : null}
      {!loading && !hasSelection ? <p className="module-copy">{emptyText}</p> : null}
      {hasSelection ? children : null}
    </section>
  );
}
