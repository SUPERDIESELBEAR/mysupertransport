export type OperatorView =
  | 'home'
  | 'progress'
  | 'documents'
  | 'messages'
  | 'resource-center'
  | 'faq'
  | 'dispatch'
  | 'ica'
  | 'notifications'
  | 'docs-hub'
  | 'inspection-binder'
  | 'pay-setup'
  | 'my-docs'
  | 'my-truck'
  | 'forecast';

export const OPERATOR_VIEWS: OperatorView[] = [
  'home',
  'progress',
  'documents',
  'messages',
  'resource-center',
  'faq',
  'dispatch',
  'ica',
  'notifications',
  'docs-hub',
  'inspection-binder',
  'pay-setup',
  'my-docs',
  'my-truck',
  'forecast',
];

export const isOperatorView = (value: string | null): value is OperatorView =>
  !!value && OPERATOR_VIEWS.includes(value as OperatorView);

export type OperatorViewState = { view: OperatorView; binderView?: 'pages' };
export type OperatorNavigateOptions = { binderView?: 'pages'; replace?: boolean; closeMobileMenu?: boolean };

const VIEW_TO_ROUTE: Record<OperatorView, string> = {
  home: 'home',
  progress: 'status',
  documents: 'documents',
  messages: 'messages',
  'resource-center': 'resources',
  faq: 'faq',
  dispatch: 'dispatch',
  ica: 'ica',
  notifications: 'notifications',
  'docs-hub': 'doc-hub',
  'inspection-binder': 'binder',
  'pay-setup': 'pay-setup',
  'my-docs': 'my-docs',
  'my-truck': 'my-truck',
  forecast: 'forecast',
};

const ROUTE_TO_VIEW: Record<string, OperatorView> = {
  home: 'home',
  status: 'progress',
  progress: 'progress',
  documents: 'documents',
  messages: 'messages',
  resources: 'resource-center',
  'resource-center': 'resource-center',
  'service-library': 'resource-center',
  faq: 'faq',
  dispatch: 'dispatch',
  ica: 'ica',
  notifications: 'notifications',
  'doc-hub': 'docs-hub',
  'docs-hub': 'docs-hub',
  binder: 'inspection-binder',
  'inspection-binder': 'inspection-binder',
  'pay-setup': 'pay-setup',
  'my-docs': 'my-docs',
  'my-documents': 'my-docs',
  'my-truck': 'my-truck',
  forecast: 'forecast',
};

const LEGACY_TAB_TO_VIEW: Record<string, OperatorView> = {
  status: 'progress',
  'doc-hub': 'docs-hub',
  binder: 'inspection-binder',
  resources: 'resource-center',
  'service-library': 'resource-center',
  'my-documents': 'my-docs',
};

export const getOperatorViewFromTab = (value: string | null): OperatorView | null => {
  if (isOperatorView(value)) return value;
  return value ? LEGACY_TAB_TO_VIEW[value] ?? null : null;
};

export const getOperatorBasePath = (pathname: string) => {
  if (pathname === '/owner' || pathname.startsWith('/owner/')) return '/owner';
  return '/operator';
};

export const getRouteSegments = (pathname: string) => {
  const base = getOperatorBasePath(pathname);
  if (pathname === base) return [];
  if (!pathname.startsWith(`${base}/`)) return [];
  return pathname.slice(base.length + 1).split('/').filter(Boolean);
};

export const buildOperatorViewUrl = (
  pathname: string,
  search: string,
  target: OperatorView,
  options: OperatorNavigateOptions = {},
) => {
  const params = new URLSearchParams(search);
  params.delete('tab');
  params.delete('binderView');
  const nextSearch = params.toString();
  const base = getOperatorBasePath(pathname);
  const route = VIEW_TO_ROUTE[target];
  const nextPath = target === 'inspection-binder' && options.binderView === 'pages'
    ? `${base}/${route}/pages`
    : `${base}/${route}`;
  return {
    pathname: nextPath,
    search: nextSearch ? `?${nextSearch}` : '',
    binderView: target === 'inspection-binder' && options.binderView === 'pages' ? 'pages' as const : undefined,
  };
};

export const getViewStateFromSearch = (search: string): OperatorViewState => {
  const params = new URLSearchParams(search);
  const view = getOperatorViewFromTab(params.get('tab')) ?? 'progress';
  return {
    view,
    binderView: view === 'inspection-binder' && params.get('binderView') === 'pages' ? 'pages' : undefined,
  };
};

export const getViewStateFromLocation = (pathname: string, search: string): OperatorViewState => {
  const segments = getRouteSegments(pathname);
  const routeView = segments[0] ? ROUTE_TO_VIEW[segments[0]] : null;
  if (routeView) {
    return {
      view: routeView,
      binderView: routeView === 'inspection-binder' && segments[1] === 'pages' ? 'pages' : undefined,
    };
  }
  return getViewStateFromSearch(search);
};

export const isKnownOperatorRoute = (pathname: string) => {
  const segments = getRouteSegments(pathname);
  if (segments.length === 0) return true;
  return !!ROUTE_TO_VIEW[segments[0]];
};