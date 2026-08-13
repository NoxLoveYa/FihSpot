import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMap, faSatellite } from '@fortawesome/free-solid-svg-icons';

export type MapType = 'roadmap' | 'satellite';

interface MapTypeToggleProps {
  mapType: MapType;
  onChange: (type: MapType) => void;
  className?: string;
}

export function MapTypeToggle({ mapType, onChange, className = '' }: MapTypeToggleProps) {
  const { t } = useTranslation();

  const buttons: { value: MapType; icon: typeof faMap; label: string }[] = [
    { value: 'roadmap', icon: faMap, label: t('map.mapType.map') },
    { value: 'satellite', icon: faSatellite, label: t('map.mapType.satellite') },
  ];

  return (
    <div
      role="group"
      aria-label={t('map.mapType.label')}
      className={`glass flex shrink-0 items-center gap-1 rounded-xl p-1 ${className}`}
    >
      {buttons.map((b) => (
        <button
          key={b.value}
          onClick={() => onChange(b.value)}
          aria-pressed={mapType === b.value}
          title={b.label}
          className={`flex h-8 w-9 items-center justify-center gap-1.5 rounded-lg px-0 text-xs font-semibold transition-colors active:scale-95 lg:w-auto lg:px-2.5 ${
            mapType === b.value
              ? 'bg-brand-600 text-white shadow-float'
              : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <FontAwesomeIcon icon={b.icon} className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{b.label}</span>
        </button>
      ))}
    </div>
  );
}
