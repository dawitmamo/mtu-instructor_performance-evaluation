export function StatCard({ label, value, helper, tone = 'blue' }) {
  return (
    <section className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </section>
  );
}
