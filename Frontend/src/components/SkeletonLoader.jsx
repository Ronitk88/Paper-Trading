function SkeletonLoader({ rows = 5 }) {
  return (
    <div className="skeleton-card">
      <div className="skeleton-line medium" />
      <div className="skeleton-line short" />

      <div style={{ marginTop: "24px" }}>
        {Array.from({ length: rows }).map((_, index) => (
          <div className="skeleton-table-row" key={index}>
            <div className="skeleton-line long" />
            <div className="skeleton-line medium" />
            <div className="skeleton-line short" />
            <div className="skeleton-line medium" />
            <div className="skeleton-line short" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default SkeletonLoader;