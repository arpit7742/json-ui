"use client";

import { type ReactNode, useMemo } from "react";
import {
  Renderer,
  type ComponentRenderer,
  type Spec,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
} from "@json-render/react";

import { registry, Fallback } from "./registry";

// =============================================================================
// ExplorerRenderer
// =============================================================================

interface ExplorerRendererProps {
  spec: Spec | null;
  loading?: boolean;
}

const fallback: ComponentRenderer = ({ element }) => (
  <Fallback type={element.type} />
);

/**
 * Sanitize spec to ensure all elements have a valid `props` object.
 * The AI sometimes generates elements with null/undefined props which
 * crashes @json-render/core's resolveBindings (Object.entries(null)).
 */
function sanitizeSpec(spec: Spec): Spec {
  if (!spec.elements) return spec;
  const elements = { ...spec.elements };
  for (const key of Object.keys(elements)) {
    const el = elements[key];
    if (el && !el.props) {
      elements[key] = { ...el, props: {} };
    }
  }
  return { ...spec, elements };
}

export function ExplorerRenderer({
  spec,
  loading,
}: ExplorerRendererProps): ReactNode {
  if (!spec) return null;

  const safeSpec = useMemo(() => sanitizeSpec(spec), [spec]);

  return (
    <StateProvider initialState={safeSpec.state ?? {}}>
      <VisibilityProvider>
        <ActionProvider>
          <Renderer
            spec={safeSpec}
            registry={registry}
            fallback={fallback}
            loading={loading}
          />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}
