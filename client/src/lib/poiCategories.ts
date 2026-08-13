import { icon as faIcon } from '@fortawesome/fontawesome-svg-core';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faLandmark,
  faLeaf,
  faUtensils,
  faFutbol,
  faBagShopping,
  faLocationDot,
} from '@fortawesome/free-solid-svg-icons';

export const categoryColors: Record<string, string> = {
  culture: '#8b5cf6',
  nature: '#10b981',
  food: '#f59e0b',
  sport: '#ef4444',
  shop: '#06b6d4',
};

export const categoryIcons: Record<string, IconDefinition> = {
  culture: faLandmark,
  nature: faLeaf,
  food: faUtensils,
  sport: faFutbol,
  shop: faBagShopping,
};

export function categoryColor(category: string | null): string {
  if (category && categoryColors[category]) return categoryColors[category];
  return '#6366f1';
}

export function categoryIcon(category: string | null): IconDefinition {
  if (category && categoryIcons[category]) return categoryIcons[category];
  return faLocationDot;
}

export function categoryIconHtml(category: string | null): string {
  const rendered = faIcon(categoryIcon(category));
  return rendered ? rendered.html[0] : '';
}
