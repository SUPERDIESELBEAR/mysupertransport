import { describe, expect, it } from 'vitest';
import {
  buildOperatorViewUrl,
  getViewStateFromLocation,
  getViewStateFromSearch,
} from './operatorRoutes';

describe('operator route helpers', () => {
  it('builds stable path-based routes and strips legacy tab parameters', () => {
    expect(buildOperatorViewUrl('/dashboard', '?tab=progress&thread=abc', 'docs-hub')).toEqual({
      pathname: '/operator/doc-hub',
      search: '?thread=abc',
      binderView: undefined,
    });
  });

  it('resolves legacy query tabs before onboarding data loads', () => {
    expect(getViewStateFromSearch('?tab=docs-hub')).toEqual({ view: 'docs-hub', binderView: undefined });
    expect(getViewStateFromSearch('?tab=service-library')).toEqual({ view: 'resource-center', binderView: undefined });
    expect(getViewStateFromSearch('?tab=inspection-binder&binderView=pages')).toEqual({ view: 'inspection-binder', binderView: 'pages' });
  });

  it('resolves new route paths as the source of truth', () => {
    expect(getViewStateFromLocation('/operator/pay-setup', '')).toEqual({ view: 'pay-setup', binderView: undefined });
    expect(getViewStateFromLocation('/operator/binder/pages', '')).toEqual({ view: 'inspection-binder', binderView: 'pages' });
    expect(getViewStateFromLocation('/owner/resources', '')).toEqual({ view: 'resource-center', binderView: undefined });
  });
});