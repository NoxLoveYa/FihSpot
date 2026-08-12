import { useState } from 'react';
import type { FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LatLng } from 'leaflet';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Button } from './Button';
import { Input } from './Input';
import { Spinner } from './Spinner';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface AddPoiPanelProps {
  position: LatLng | null;
  onCancel: () => void;
  onCreated: () => void;
}

export function AddPoiPanel({ position, onCancel, onCreated }: AddPoiPanelProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const categories = [
    { value: '', label: t('categories.general') },
    { value: 'culture', label: `🏛 ${t('categories.culture')}` },
    { value: 'nature', label: `🌿 ${t('categories.nature')}` },
    { value: 'food', label: `🍽 ${t('categories.food')}` },
    { value: 'sport', label: `⚽ ${t('categories.sport')}` },
    { value: 'shop', label: `🛍 ${t('categories.shop')}` },
  ];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!position) return;
    setError('');
    if (!name.trim()) {
      setError(t('addPoi.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await api.createPoi({
        name,
        description,
        category: category || undefined,
        lat: position.lat,
        lng: position.lng,
      });
      toast(t('addPoi.created'), 'success');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('addPoi.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {position && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 z-[1300] bg-black/40"
          />
      <motion.form
        onSubmit={submit}
        initial={isDesktop ? { x: '100%' } : { y: '100%' }}
        animate={isDesktop ? { x: 0 } : { y: 0 }}
        exit={isDesktop ? { x: '100%' } : { y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className={`fixed z-[1400] flex flex-col gap-4 overflow-hidden rounded-t-3xl bg-white p-5 shadow-soft dark:bg-slate-800 md:bottom-0 md:left-auto md:top-0 md:h-full md:rounded-none md:rounded-l-3xl ${
          isDesktop ? 'right-0 w-[420px]' : 'inset-x-0 bottom-0'
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t('addPoi.title')}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
          >
            ✕
          </button>
        </div>

        <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
          📍 {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </div>

        {error && <p className="text-sm font-medium text-rose-500">{error}</p>}

        <Input label={t('fields.name')} required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('addPoi.namePlaceholder')} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">{t('addPoi.description')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t('addPoi.descriptionPlaceholder')}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">{t('addPoi.category')}</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <Button type="submit" disabled={saving} className="mt-2 w-full">
          {saving ? <Spinner /> : t('addPoi.create')}
        </Button>
        </motion.form>
        </>
      )}
    </AnimatePresence>
  );
}
