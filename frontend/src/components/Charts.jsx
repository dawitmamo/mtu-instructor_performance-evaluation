import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function AnalyticsCharts(props) {
  const scores = props.scores;
  if (!scores.length) return <section className='panel empty-state'><h2>No evaluation scores yet</h2><p>Charts will appear after evaluations are submitted.</p></section>;
  return <section className='panel chart-panel'>
    <h2>Category Scores</h2>
    <ResponsiveContainer width='100%' height={290}>
      <BarChart data={scores}>
        <CartesianGrid strokeDasharray='3 3' />
        <XAxis dataKey='category' interval={0} angle={-18} textAnchor='end' height={72} />
        <YAxis domain={[0, 5]} /><Tooltip />
        <Bar dataKey='score' fill='#0f766e' />
      </BarChart>
    </ResponsiveContainer>
  </section>;
}
