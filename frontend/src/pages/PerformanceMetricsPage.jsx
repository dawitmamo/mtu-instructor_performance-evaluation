import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { getEvaluationTemplate, saveHodEvaluationTemplate } from '../api/client.js';

function localId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function editableTemplate(template) {
  return {
    name: template?.name || 'Department Head Performance Evaluation',
    description: template?.description || '',
    categories: (template?.categories || []).map((category) => ({
      id: localId(),
      name: category.name,
      metrics: category.questions.slice().sort((first, second) => first.order - second.order).map((question) => ({
        id: localId(), name: question.text, value: question.value || 1
      }))
    }))
  };
}

export function PerformanceMetricsPage() {
  const [template, setTemplate] = useState(null);
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getEvaluationTemplate('HOD')
      .then((loaded) => { setTemplate(editableTemplate(loaded)); setVersion(loaded.version); })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Performance metrics could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => (template?.categories || []).map((criterion) => ({
    id: criterion.id,
    metrics: criterion.metrics.length,
    value: criterion.metrics.reduce((sum, metric) => sum + (Number(metric.value) || 0), 0)
  })), [template]);

  const updateCategory = (categoryId, update) => setTemplate((current) => ({
    ...current,
    categories: current.categories.map((category) => category.id === categoryId ? { ...category, ...update } : category)
  }));
  const updateMetric = (categoryId, metricId, update) => setTemplate((current) => ({
    ...current,
    categories: current.categories.map((category) => category.id === categoryId ? {
      ...category,
      metrics: category.metrics.map((metric) => metric.id === metricId ? { ...metric, ...update } : metric)
    } : category)
  }));
  const addCategory = () => setTemplate((current) => ({
    ...current,
    categories: [...current.categories, { id: localId(), name: '', metrics: [{ id: localId(), name: '', value: 1 }] }]
  }));
  const removeCategory = (categoryId) => setTemplate((current) => ({
    ...current, categories: current.categories.filter((category) => category.id !== categoryId)
  }));
  const addMetric = (categoryId) => setTemplate((current) => ({
    ...current,
    categories: current.categories.map((category) => category.id === categoryId ? {
      ...category, metrics: [...category.metrics, { id: localId(), name: '', value: 1 }]
    } : category)
  }));
  const removeMetric = (categoryId, metricId) => setTemplate((current) => ({
    ...current,
    categories: current.categories.map((category) => category.id === categoryId ? {
      ...category, metrics: category.metrics.filter((metric) => metric.id !== metricId)
    } : category)
  }));

  const save = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!template.categories.length || template.categories.some((category) => !category.name.trim() || !category.metrics.length || category.metrics.some((metric) => !metric.name.trim()))) {
      setError('Every criterion needs a name and at least one named performance metric.'); return;
    }
    setSaving(true);
    try {
      const payload = {
        name: template.name,
        description: template.description,
        categories: template.categories.map((category) => ({
          name: category.name,
          metrics: category.metrics.map((metric) => ({ name: metric.name, value: Number(metric.value) }))
        }))
      };
      const result = await saveHodEvaluationTemplate(payload);
      setTemplate(editableTemplate(result.template));
      setVersion(result.template.version);
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Performance metrics could not be saved.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className='loading-state'>Loading performance metrics...</div>;
  if (!template) return <div className='error-message'>{error || 'Performance metrics are unavailable.'}</div>;

  return <section className='panel data-page metric-manager'>
    <div className='panel-title'><div><h2>HOD performance metrics</h2><p>Organize metrics under criteria and assign a relative value from 1 to 100. Higher values contribute more to the HOD score.</p></div><span>Version {version || 1}</span></div>
    <form onSubmit={save}>
      <div className='metric-template-fields'>
        <label><span>Template name</span><input value={template.name} minLength={3} maxLength={150} required onChange={(event) => setTemplate({ ...template, name: event.target.value })} /></label>
        <label><span>Description</span><textarea value={template.description} maxLength={1000} rows={2} onChange={(event) => setTemplate({ ...template, description: event.target.value })} /></label>
      </div>
      <div className='criteria-list'>{template.categories.map((category) => {
        const total = totals.find((item) => item.id === category.id);
        return <article className='criterion-card' key={category.id}>
          <div className='criterion-heading'>
            <label><span>Criterion</span><input value={category.name} minLength={2} maxLength={100} required placeholder='e.g. Teaching quality' onChange={(event) => updateCategory(category.id, { name: event.target.value })} /></label>
            <div><small>{total.metrics} metrics · total value {total.value}</small><button type='button' className='icon-action danger-action' title='Remove criterion' aria-label={`Remove ${category.name || 'criterion'}`} onClick={() => removeCategory(category.id)} disabled={template.categories.length === 1}><Trash2 size={17} /></button></div>
          </div>
          <div className='metric-list'>{category.metrics.map((metric, metricIndex) => <div className='metric-row' key={metric.id}>
            <label className='metric-name'><span>Performance metric {metricIndex + 1}</span><input value={metric.name} minLength={2} maxLength={300} required placeholder='Describe the observable performance' onChange={(event) => updateMetric(category.id, metric.id, { name: event.target.value })} /></label>
            <label className='metric-value'><span>Value</span><input type='number' value={metric.value} min='1' max='100' step='1' required onChange={(event) => updateMetric(category.id, metric.id, { value: event.target.value })} /></label>
            <button type='button' className='icon-action danger-action' title='Remove metric' aria-label='Remove metric' onClick={() => removeMetric(category.id, metric.id)} disabled={category.metrics.length === 1}><Trash2 size={17} /></button>
          </div>)}</div>
          <button type='button' className='secondary-action' onClick={() => addMetric(category.id)}><Plus size={16} /> Add metric</button>
        </article>;
      })}</div>
      <div className='metric-actions'><button type='button' className='secondary-action' onClick={addCategory}><Plus size={17} /> Add criterion</button><button className='primary-action' disabled={saving}><Save size={17} /> {saving ? 'Saving...' : 'Save and activate'}</button></div>
      <p className='metric-version-note'>Saving creates a new active version for your department. Existing submitted evaluations keep their original metric values.</p>
      {message && <div className='success-message'>{message}</div>}
      {error && <div className='error-message'>{error}</div>}
    </form>
  </section>;
}
