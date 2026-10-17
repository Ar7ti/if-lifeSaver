import type { ComponentType, ReactNode } from 'react';
import { CalendarClock, Gauge, Lightbulb, ListChecks, ShieldCheck, ShoppingBag, Store, Truck, Wallet } from 'lucide-react';
import type { WorkspaceWidget } from '@contracts';
import { BudgetWidget } from '@/features/widgets/BudgetWidget';
import { ResearchCatalog } from '@/features/widgets/research/ResearchCatalog';
import { ShoppingCart } from '@/features/widgets/ShoppingCart';
import { ScenarioSimulator } from '@/features/widgets/ScenarioSimulator';
import { RiskGuardian } from '@/features/widgets/RiskGuardian';
import { ActionTimeline } from '@/features/widgets/ActionTimeline';
import { RecommendationsWidget } from '@/features/widgets/RecommendationsWidget';
import { TaskList } from '@/features/widgets/TaskList';

export interface WidgetDefinition {
  /** Friendly marker shown in the widget header (native emoji). */
  emoji: string;
  label: string;
  icon: ReactNode;
  Component: ComponentType<{ widget: WorkspaceWidget }>;
  /** Rendering floor on desktop: wide layouts that are unreadable at half width. */
  minSpan: 6 | 12;
}

/**
 * The fixed registry. The server's workspace spec only names a widget type plus
 * declarative config; it can never introduce code, markup or a component outside this map.
 */
export const REGISTRY: Record<WorkspaceWidget['type'], WidgetDefinition> = {
  budget: { emoji: '💸', label: 'Budget', icon: <Wallet />, Component: BudgetWidget, minSpan: 6 },
  product_catalog: { emoji: '🛋️', label: 'Furniture', icon: <Store />, Component: ({ widget }) => <ResearchCatalog kind="product" widget={widget} />, minSpan: 12 },
  shopping_cart: { emoji: '🛒', label: 'Planning cart', icon: <ShoppingBag />, Component: ShoppingCart, minSpan: 6 },
  service_finder: { emoji: '🚚', label: 'Service finder', icon: <Truck />, Component: ({ widget }) => <ResearchCatalog kind="service" widget={widget} />, minSpan: 12 },
  scenario_comparison: { emoji: '⚖️', label: 'Scenario simulator', icon: <Gauge />, Component: ScenarioSimulator, minSpan: 12 },
  risk_guardian: { emoji: '🛡️', label: 'Life Risk Guardian', icon: <ShieldCheck />, Component: RiskGuardian, minSpan: 6 },
  timeline: { emoji: '📅', label: 'Timeline', icon: <CalendarClock />, Component: ActionTimeline, minSpan: 6 },
  recommendations: { emoji: '💡', label: 'Next steps', icon: <Lightbulb />, Component: RecommendationsWidget, minSpan: 6 },
  task_list: { emoji: '✅', label: 'Checklist', icon: <ListChecks />, Component: TaskList, minSpan: 6 },
};
