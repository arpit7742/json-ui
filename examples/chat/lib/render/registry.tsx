"use client";

import { useState, useRef, type ReactNode } from "react";
import { useBoundProp, defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  Area,
  AreaChart as RechartsAreaChart,
  XAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Lightbulb,
  AlertTriangle,
  Star,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

// 3D imports
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Stars as DreiStars,
  Text as DreiText,
} from "@react-three/drei";
import type * as THREE from "three";

import { explorerCatalog } from "./catalog";

// =============================================================================
// 3D Helper Types & Components
// =============================================================================

type Vec3Tuple = [number, number, number];

interface Animation3D {
  rotate?: number[] | null;
}

interface Mesh3DProps {
  position?: number[] | null;
  rotation?: number[] | null;
  scale?: number[] | null;
  color?: string | null;
  args?: number[] | null;
  metalness?: number | null;
  roughness?: number | null;
  emissive?: string | null;
  emissiveIntensity?: number | null;
  wireframe?: boolean | null;
  opacity?: number | null;
  animation?: Animation3D | null;
}

function toVec3(v: number[] | null | undefined): Vec3Tuple | undefined {
  if (!v || v.length < 3) return undefined;
  return v.slice(0, 3) as Vec3Tuple;
}

function toGeoArgs<T extends unknown[]>(
  v: number[] | null | undefined,
  fallback: T,
): T {
  if (!v || v.length === 0) return fallback;
  return v as unknown as T;
}

/** Shared hook for continuous rotation animation */
function useRotationAnimation(
  ref: React.RefObject<THREE.Object3D | null>,
  animation?: Animation3D | null,
) {
  useFrame(() => {
    if (!ref.current || !animation?.rotate) return;
    const [rx, ry, rz] = animation.rotate;
    ref.current.rotation.x += rx ?? 0;
    ref.current.rotation.y += ry ?? 0;
    ref.current.rotation.z += rz ?? 0;
  });
}

/** Standard material props shared by all mesh primitives */
function StandardMaterial({
  color,
  metalness,
  roughness,
  emissive,
  emissiveIntensity,
  wireframe,
  opacity,
}: Mesh3DProps) {
  return (
    <meshStandardMaterial
      color={color ?? "#cccccc"}
      metalness={metalness ?? 0.1}
      roughness={roughness ?? 0.8}
      emissive={emissive ?? undefined}
      emissiveIntensity={emissiveIntensity ?? 1}
      wireframe={wireframe ?? false}
      transparent={opacity != null && opacity < 1}
      opacity={opacity ?? 1}
    />
  );
}

/** Generic mesh wrapper for all geometry primitives */
function MeshPrimitive({
  meshProps,
  children,
  onClick,
}: {
  meshProps: Mesh3DProps;
  children: ReactNode;
  onClick?: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useRotationAnimation(ref, meshProps.animation);
  return (
    <mesh
      ref={ref}
      position={toVec3(meshProps.position)}
      rotation={toVec3(meshProps.rotation)}
      scale={toVec3(meshProps.scale)}
      onClick={onClick}
    >
      {children}
      <StandardMaterial {...meshProps} />
    </mesh>
  );
}

/** Animated group wrapper */
function AnimatedGroup({
  position,
  rotation,
  scale,
  animation,
  children,
}: {
  position?: number[] | null;
  rotation?: number[] | null;
  scale?: number[] | null;
  animation?: Animation3D | null;
  children?: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useRotationAnimation(ref, animation);
  return (
    <group
      ref={ref}
      position={toVec3(position)}
      rotation={toVec3(rotation)}
      scale={toVec3(scale)}
    >
      {children}
    </group>
  );
}

// =============================================================================
// Registry
// =============================================================================

export const { registry, handlers } = defineRegistry(explorerCatalog, {
  components: {
    // From @json-render/shadcn (used as-is)
    Stack: shadcnComponents.Stack,
    Card: shadcnComponents.Card,
    Grid: shadcnComponents.Grid,
    Heading: shadcnComponents.Heading,
    Separator: shadcnComponents.Separator,
    Accordion: shadcnComponents.Accordion,
    Progress: shadcnComponents.Progress,
    Skeleton: shadcnComponents.Skeleton,
    Badge: shadcnComponents.Badge,
    Alert: shadcnComponents.Alert,

    // Chat-specific components
    Text: ({ props }) => (
      <p className={props.muted ? "text-muted-foreground" : ""}>
        {props.content}
      </p>
    ),

    Metric: ({ props }) => {
      const TrendIcon =
        props.trend === "up"
          ? TrendingUp
          : props.trend === "down"
            ? TrendingDown
            : Minus;
      const trendColor =
        props.trend === "up"
          ? "text-green-500"
          : props.trend === "down"
            ? "text-red-500"
            : "text-muted-foreground";

      // Handle unresolved $state bindings — display the raw value or empty
      const displayValue =
        typeof props.value === "string"
          ? props.value
          : typeof props.value === "number"
            ? String(props.value)
            : props.value != null && typeof props.value === "object"
              ? ""
              : "";
      const displayDetail =
        typeof props.detail === "string" ? props.detail : "";

      return (
        <div className="flex flex-col justify-between bg-card border border-border p-3 min-w-0 min-h-[72px]">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {props.label}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-[22px] font-extrabold text-foreground truncate">
              {displayValue}
            </span>
            {props.trend && (
              <TrendIcon className={`h-3.5 w-3.5 shrink-0 ${trendColor}`} />
            )}
          </div>
          {displayDetail && (
            <p className="text-xs text-muted-foreground truncate">
              {displayDetail}
            </p>
          )}
        </div>
      );
    },

    Table: ({ props }) => {
      const rawData = props.data;
      const items: Array<Record<string, unknown>> = Array.isArray(rawData)
        ? rawData
        : Array.isArray((rawData as Record<string, unknown>)?.data)
          ? ((rawData as Record<string, unknown>).data as Array<
              Record<string, unknown>
            >)
          : [];

      const [sortKey, setSortKey] = useState<string | null>(null);
      const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

      if (items.length === 0) {
        return (
          <div className="text-center py-4 text-muted-foreground">
            {props.emptyMessage ?? "No data"}
          </div>
        );
      }

      const sorted = sortKey
        ? [...items].sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            // numeric comparison when both values are numbers
            if (typeof av === "number" && typeof bv === "number") {
              return sortDir === "asc" ? av - bv : bv - av;
            }
            const as = String(av ?? "");
            const bs = String(bv ?? "");
            return sortDir === "asc"
              ? as.localeCompare(bs)
              : bs.localeCompare(as);
          })
        : items;

      const handleSort = (key: string) => {
        if (sortKey === key) {
          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
          setSortKey(key);
          setSortDir("asc");
        }
      };

      return (
        <Table>
          <TableHeader>
            <TableRow>
              {props.columns.map((col) => {
                const SortIcon =
                  sortKey === col.key
                    ? sortDir === "asc"
                      ? ArrowUp
                      : ArrowDown
                    : ArrowUpDown;
                return (
                  <TableHead key={col.key}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      <SortIcon className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((item, i) => (
              <TableRow key={i}>
                {props.columns.map((col) => (
                  <TableCell key={col.key}>
                    {String(item[col.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    },

    Link: ({ props }) => (
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-4 hover:text-primary/80"
      >
        {props.text}
      </a>
    ),

    BarChart: ({ props }) => {
      const rawData = props.data;
      const rawItems: Array<Record<string, unknown>> = Array.isArray(rawData)
        ? rawData
        : Array.isArray((rawData as Record<string, unknown>)?.data)
          ? ((rawData as Record<string, unknown>).data as Array<
              Record<string, unknown>
            >)
          : typeof rawData === "object" &&
              rawData !== null &&
              "$state" in (rawData as object)
            ? [] // unresolved $state binding
            : [];

      const { items, valueKey } = processChartData(
        rawItems,
        props.xKey,
        props.yKey,
        props.aggregate,
      );

      // Assign colors based on value intensity (matching Paper design palette)
      // Amber and red work in both light/dark. Grey and black adapt via CSS.
      const BAR_COLORS_BY_VALUE = (value: number, max: number): string => {
        const ratio = max > 0 ? value / max : 0;
        if (ratio < 0.15) return "#9CA3AF"; // low - neutral grey (visible in both modes)
        if (ratio < 0.5) return "#D8941F"; // medium - amber/gold
        if (ratio < 0.75) return "#D44A3D"; // high - red
        return "#374151"; // extreme - dark grey (visible in both modes)
      };

      const maxVal = Math.max(
        ...items.map((item) => {
          const v = item[valueKey];
          return typeof v === "number" ? v : parseFloat(String(v)) || 0;
        }),
        1,
      );

      const coloredItems = items.map((item) => {
        const v =
          typeof item[valueKey] === "number"
            ? (item[valueKey] as number)
            : parseFloat(String(item[valueKey])) || 0;
        return { ...item, fill: BAR_COLORS_BY_VALUE(v, maxVal) };
      });

      const chartConfig = {
        [valueKey]: {
          label: valueKey,
          color: props.color ?? "var(--chart-1)",
        },
      } satisfies ChartConfig;

      if (items.length === 0) {
        return (
          <div className="text-center py-4 text-muted-foreground">
            Loading...
          </div>
        );
      }

      return (
        <div className="w-full">
          {props.title && (
            <p className="text-sm font-medium mb-2">{props.title}</p>
          )}
          <ChartContainer
            config={chartConfig}
            className="min-h-[200px] w-full"
            style={{ height: props.height ?? 300 }}
          >
            <RechartsBarChart accessibilityLayer data={coloredItems}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey={valueKey} radius={4}>
                {coloredItems.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </RechartsBarChart>
          </ChartContainer>
        </div>
      );
    },

    LineChart: ({ props }) => {
      const rawData = props.data;
      const rawItems: Array<Record<string, unknown>> = Array.isArray(rawData)
        ? rawData
        : Array.isArray((rawData as Record<string, unknown>)?.data)
          ? ((rawData as Record<string, unknown>).data as Array<
              Record<string, unknown>
            >)
          : [];

      const { items, valueKey } = processChartData(
        rawItems,
        props.xKey,
        props.yKey,
        props.aggregate,
      );

      const chartColor = props.color ?? "var(--chart-1)";

      const chartConfig = {
        [valueKey]: {
          label: valueKey,
          color: chartColor,
        },
      } satisfies ChartConfig;

      if (items.length === 0) {
        return (
          <div className="text-center py-4 text-muted-foreground">
            Loading...
          </div>
        );
      }

      return (
        <div className="w-full">
          {props.title && (
            <p className="text-sm font-medium mb-2">{props.title}</p>
          )}
          <ChartContainer
            config={chartConfig}
            className="min-h-[200px] w-full [&_svg]:overflow-visible"
            style={{ height: props.height ?? 300 }}
          >
            <RechartsLineChart accessibilityLayer data={items}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                interval={
                  items.length > 12
                    ? Math.ceil(items.length / 8) - 1
                    : undefined
                }
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey={valueKey}
                stroke={`var(--color-${valueKey})`}
                strokeWidth={2}
                dot={false}
              />
            </RechartsLineChart>
          </ChartContainer>
        </div>
      );
    },

    Tabs: ({ props, children }) => (
      <Tabs defaultValue={props.defaultValue ?? (props.tabs ?? [])[0]?.value}>
        <TabsList>
          {(props.tabs ?? []).map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {children}
      </Tabs>
    ),

    TabContent: ({ props, children }) => (
      <TabsContent value={props.value}>{children}</TabsContent>
    ),

    Callout: ({ props }) => {
      const config = {
        info: {
          icon: Info,
          border: "border-l-blue-500",
          bg: "bg-blue-500/5",
          iconColor: "text-blue-500",
        },
        tip: {
          icon: Lightbulb,
          border: "border-l-emerald-500",
          bg: "bg-emerald-500/5",
          iconColor: "text-emerald-500",
        },
        warning: {
          icon: AlertTriangle,
          border: "border-l-amber-500",
          bg: "bg-amber-500/5",
          iconColor: "text-amber-500",
        },
        important: {
          icon: Star,
          border: "border-l-purple-500",
          bg: "bg-purple-500/5",
          iconColor: "text-purple-500",
        },
      }[props.type ?? "info"] ?? {
        icon: Info,
        border: "border-l-blue-500",
        bg: "bg-blue-500/5",
        iconColor: "text-blue-500",
      };
      const Icon = config.icon;
      return (
        <div
          className={`border-l-4 ${config.border} ${config.bg} rounded-r-lg p-4`}
        >
          <div className="flex items-start gap-3">
            <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.iconColor}`} />
            <div className="flex-1 min-w-0">
              {props.title && (
                <p className="font-semibold text-sm mb-1">{props.title}</p>
              )}
              <p className="text-sm text-muted-foreground">{props.content}</p>
            </div>
          </div>
        </div>
      );
    },

    Timeline: ({ props }) => (
      <div className="relative pl-8">
        {/* Vertical line centered on dots: dot is 12px wide starting at 0px, center = 6px */}
        <div className="absolute left-[5.5px] top-3 bottom-3 w-px bg-border" />
        <div className="flex flex-col gap-6">
          {(props.items ?? []).map((item, i) => {
            const dotColor =
              item.status === "completed"
                ? "bg-emerald-500"
                : item.status === "current"
                  ? "bg-blue-500"
                  : "bg-muted-foreground/30";
            return (
              <div key={i} className="relative">
                <div
                  className={`absolute -left-8 top-0.5 h-3 w-3 rounded-full ${dotColor} ring-2 ring-background`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{item.title}</p>
                    {item.date && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {item.date}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),

    PieChart: ({ props }) => {
      const rawData = props.data;
      const items: Array<Record<string, unknown>> = Array.isArray(rawData)
        ? rawData
        : Array.isArray((rawData as Record<string, unknown>)?.data)
          ? ((rawData as Record<string, unknown>).data as Array<
              Record<string, unknown>
            >)
          : [];

      if (items.length === 0) {
        return (
          <div className="text-center py-4 text-muted-foreground">
            Loading...
          </div>
        );
      }

      const chartConfig: ChartConfig = {};
      items.forEach((item, i) => {
        const name = String(item[props.nameKey] ?? `Segment ${i + 1}`);
        chartConfig[name] = {
          label: name,
          color: PIE_COLORS[i % PIE_COLORS.length],
        };
      });

      return (
        <div className="w-full">
          {props.title && (
            <p className="text-sm font-medium mb-2">{props.title}</p>
          )}
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square w-full"
            style={{ height: props.height ?? 300 }}
          >
            <RechartsPieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={items.map((item, i) => ({
                  name: String(item[props.nameKey] ?? `Segment ${i + 1}`),
                  value:
                    typeof item[props.valueKey] === "number"
                      ? item[props.valueKey]
                      : parseFloat(String(item[props.valueKey])) || 0,
                  fill: PIE_COLORS[i % PIE_COLORS.length],
                }))}
                dataKey="value"
                nameKey="name"
                innerRadius="40%"
                outerRadius="70%"
                paddingAngle={2}
              />
              <Legend />
            </RechartsPieChart>
          </ChartContainer>
        </div>
      );
    },

    AreaChart: ({ props }) => {
      const rawData = props.data;
      const rawItems: Array<Record<string, unknown>> = Array.isArray(rawData)
        ? rawData
        : Array.isArray((rawData as Record<string, unknown>)?.data)
          ? ((rawData as Record<string, unknown>).data as Array<
              Record<string, unknown>
            >)
          : [];

      const items = rawItems.map((item) => ({
        ...item,
        label: String(item[props.xKey] ?? ""),
      }));

      const chartColor = props.color ?? "var(--chart-1)";
      const chartConfig = {
        [props.yKey]: { label: props.yKey, color: chartColor },
      } satisfies ChartConfig;

      if (items.length === 0) {
        return (
          <div className="text-center py-4 text-muted-foreground">
            Loading...
          </div>
        );
      }

      return (
        <div className="w-full">
          {props.title && (
            <p className="text-sm font-medium mb-2">{props.title}</p>
          )}
          <ChartContainer
            config={chartConfig}
            className="min-h-[200px] w-full [&_svg]:overflow-visible"
            style={{ height: props.height ?? 250 }}
          >
            <RechartsAreaChart accessibilityLayer data={items}>
              <defs>
                <linearGradient
                  id={`gradient-${props.yKey}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop
                    offset="95%"
                    stopColor={chartColor}
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                interval={
                  items.length > 12
                    ? Math.ceil(items.length / 8) - 1
                    : undefined
                }
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey={props.yKey}
                stroke={chartColor}
                strokeWidth={2}
                fill={`url(#gradient-${props.yKey})`}
              />
            </RechartsAreaChart>
          </ChartContainer>
        </div>
      );
    },

    WeatherMap: ({ props }) => {
      const zoom = props.zoom ?? 10;
      const height = props.height ?? "300px";
      const src = `https://www.openstreetmap.org/export/embed.html?bbox=${props.longitude - 0.5 / zoom}%2C${props.latitude - 0.3 / zoom}%2C${props.longitude + 0.5 / zoom}%2C${props.latitude + 0.3 / zoom}&layer=mapnik&marker=${props.latitude}%2C${props.longitude}`;

      return (
        <div
          className="w-full rounded-lg overflow-hidden border"
          style={{ height }}
        >
          <iframe
            src={src}
            style={{ width: "100%", height: "100%", border: 0 }}
            title={props.label ?? "Weather Map"}
            loading="lazy"
          />
          {props.label && (
            <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
              📍 {props.label}
            </div>
          )}
        </div>
      );
    },

    RiskGauge: ({ props }) => {
      const max = props.maxScore ?? 100;
      const score = props.score ?? 0;
      const pct = Math.min(100, Math.round((score / max) * 100)) || 0;
      const badgeColor =
        props.decision === "GO"
          ? "bg-emerald-500"
          : props.decision === "CAUTION"
            ? "bg-amber-500"
            : props.decision === "NO-GO"
              ? "bg-red-500"
              : pct < 40
                ? "bg-emerald-500"
                : pct < 70
                  ? "bg-amber-500"
                  : "bg-red-500";
      const strokeColor =
        props.decision === "GO" || pct < 40
          ? "#10b981"
          : props.decision === "CAUTION" || pct < 70
            ? "#f59e0b"
            : "#ef4444";

      const radius = 40;
      const circumference = Math.PI * radius;
      const arcLength = (pct / 100) * circumference;

      return (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="relative w-36 h-20">
            <svg viewBox="0 0 100 55" className="w-full h-full">
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                className="text-muted/20"
              />
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke={strokeColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${arcLength} ${circumference}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-end justify-center pb-0">
              <span className="text-3xl font-bold">{String(pct)}</span>
              <span className="text-sm text-muted-foreground ml-0.5 mb-1">
                %
              </span>
            </div>
          </div>
          {props.label && (
            <p className="text-sm text-muted-foreground">{props.label}</p>
          )}
          {props.decision && (
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white ${badgeColor}`}
            >
              {props.decision}
            </span>
          )}
        </div>
      );
    },

    SuggestedPrompts: ({ props }) => {
      const borderColors = ["#D8941F", "#D44A3D", "#111111", "#111111"];
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {(props.prompts ?? []).map((p, i) => (
            <button
              key={i}
              type="button"
              className="text-left bg-card border border-border p-3.5 hover:bg-accent transition-colors group flex flex-col justify-between gap-2"
              style={{
                borderLeftWidth: "4px",
                borderLeftColor: borderColors[i % borderColors.length],
              }}
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("flash-suggested-prompt", {
                    detail: p.prompt,
                  }),
                );
              }}
            >
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {i === (props.prompts ?? []).length - 1
                  ? "NEXT BEST ACTION"
                  : "SUGGESTED PROMPT"}
              </p>
              <p className="text-[13px] font-bold leading-snug text-foreground">
                {p.label}
              </p>
            </button>
          ))}
        </div>
      );
    },

    ActionPanel: ({ props }) => (
      <div className="border border-border rounded-lg p-4 mt-2">
        <div className="flex items-center justify-between mb-3">
          {props.title && (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {props.title}
            </p>
          )}
          {props.description && (
            <p className="text-xs text-muted-foreground">{props.description}</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(props.actions ?? []).map((action, i) => {
            const base =
              "rounded-lg px-4 py-3 text-sm font-medium transition-colors text-center";
            const variant =
              action.variant === "primary"
                ? `${base} bg-foreground text-background hover:bg-foreground/90`
                : action.variant === "secondary"
                  ? `${base} border border-border bg-card hover:bg-accent`
                  : `${base} border border-border bg-background hover:bg-accent text-muted-foreground`;
            return (
              <button key={i} type="button" className={variant}>
                <span className="block">{action.label}</span>
                {action.description && (
                  <span className="block text-xs opacity-70 mt-0.5">
                    {action.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    ),

    NumberedList: ({ props }) => (
      <div className="space-y-1">
        {props.title && (
          <p className="text-sm font-semibold mb-2">{props.title}</p>
        )}
        {(props.items ?? []).map((item, i) => (
          <div key={i} className="flex items-start gap-3 py-1.5">
            <span className="text-sm font-semibold text-muted-foreground min-w-[1.5rem]">
              {i + 1}
            </span>
            <span className="text-sm">{item}</span>
          </div>
        ))}
      </div>
    ),

    ForecastStrip: ({ props }) => {
      const borderColors: Record<string, string> = {
        low: "var(--border)",
        medium: "#D8941F",
        high: "#D44A3D",
        extreme: "var(--foreground)",
      };
      return (
        <div className="flex gap-2 overflow-x-auto">
          {(props.days ?? []).map((day, i) => (
            <div
              key={i}
              className="flex-1 min-w-[90px] flex flex-col justify-between bg-card border border-border p-2.5"
              style={{
                borderTopWidth: "4px",
                borderTopColor: borderColors[day.severity ?? "low"],
              }}
            >
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {day.label}
              </p>
              <p className="font-sans font-extrabold text-foreground text-[22px] leading-6">
                {day.value}
              </p>
              {day.detail && (
                <p className="font-sans text-foreground text-xs">
                  {day.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    },

    StatusIndicator: ({ props }) => {
      const dotColor = {
        operational: "bg-emerald-500",
        degraded: "bg-amber-500",
        critical: "bg-red-500",
        offline: "bg-gray-400",
      }[props.status];

      return (
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${dotColor} animate-pulse`}
          />
          <span className="text-sm font-medium">{props.label}</span>
          {props.detail && (
            <span className="text-xs text-muted-foreground">
              — {props.detail}
            </span>
          )}
        </div>
      );
    },

    RadioGroup: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value as string | undefined,
        bindings?.value,
      );
      const current = value ?? "";

      return (
        <div className="flex flex-col gap-2">
          {props.label && (
            <Label className="text-sm font-medium">{props.label}</Label>
          )}
          <RadioGroup
            value={current}
            onValueChange={(v: string) => setValue(v)}
          >
            {(props.options ?? []).map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <RadioGroupItem value={opt.value} id={`rg-${opt.value}`} />
                <Label
                  htmlFor={`rg-${opt.value}`}
                  className="font-normal cursor-pointer"
                >
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      );
    },

    SelectInput: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value as string | undefined,
        bindings?.value,
      );
      const current = value ?? "";

      return (
        <div className="flex flex-col gap-2">
          {props.label && (
            <Label className="text-sm font-medium">{props.label}</Label>
          )}
          <Select value={current} onValueChange={(v: string) => setValue(v)}>
            <SelectTrigger>
              <SelectValue placeholder={props.placeholder ?? "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {(props.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    },

    TextInput: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value as string | undefined,
        bindings?.value,
      );
      const current = value ?? "";

      return (
        <div className="flex flex-col gap-2">
          {props.label && (
            <Label className="text-sm font-medium">{props.label}</Label>
          )}
          <Input
            type={props.type ?? "text"}
            placeholder={props.placeholder ?? ""}
            value={current}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      );
    },

    Button: ({ props, emit }) => (
      <Button
        variant={props.variant ?? "default"}
        size={props.size ?? "default"}
        disabled={props.disabled ?? false}
        onClick={() => emit("press")}
      >
        {props.label}
      </Button>
    ),

    // =========================================================================
    // 3D Scene Components
    // =========================================================================

    Scene3D: ({ props, children }) => (
      <div
        style={{
          height: props.height ?? "400px",
          width: "100%",
          background: props.background ?? "#111111",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <Canvas
          camera={{
            position: toVec3(props.cameraPosition) ?? [0, 10, 30],
            fov: props.cameraFov ?? 50,
          }}
        >
          <OrbitControls
            autoRotate={props.autoRotate ?? false}
            enablePan
            enableZoom
          />
          {children}
        </Canvas>
      </div>
    ),

    Group3D: ({ props, children }) => (
      <AnimatedGroup
        position={props.position}
        rotation={props.rotation}
        scale={props.scale}
        animation={props.animation}
      >
        {children}
      </AnimatedGroup>
    ),

    Box: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <boxGeometry
          args={toGeoArgs<[number, number, number]>(props.args, [1, 1, 1])}
        />
      </MeshPrimitive>
    ),

    Sphere: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <sphereGeometry
          args={toGeoArgs<[number, number, number]>(props.args, [1, 32, 32])}
        />
      </MeshPrimitive>
    ),

    Cylinder: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <cylinderGeometry
          args={toGeoArgs<[number, number, number, number]>(
            props.args,
            [1, 1, 2, 32],
          )}
        />
      </MeshPrimitive>
    ),

    Cone: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <coneGeometry
          args={toGeoArgs<[number, number, number]>(props.args, [1, 2, 32])}
        />
      </MeshPrimitive>
    ),

    Torus: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <torusGeometry
          args={toGeoArgs<[number, number, number, number]>(
            props.args,
            [1, 0.4, 16, 100],
          )}
        />
      </MeshPrimitive>
    ),

    Plane: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <planeGeometry
          args={toGeoArgs<[number, number]>(props.args, [10, 10])}
        />
      </MeshPrimitive>
    ),

    Ring: ({ props, emit }) => (
      <MeshPrimitive meshProps={props} onClick={() => emit("press")}>
        <ringGeometry
          args={toGeoArgs<[number, number, number]>(props.args, [0.5, 1, 64])}
        />
      </MeshPrimitive>
    ),

    AmbientLight: ({ props }) => (
      <ambientLight
        color={props.color ?? undefined}
        intensity={props.intensity ?? 0.5}
      />
    ),

    PointLight: ({ props }) => (
      <pointLight
        position={toVec3(props.position)}
        color={props.color ?? undefined}
        intensity={props.intensity ?? 1}
        distance={props.distance ?? 0}
      />
    ),

    DirectionalLight: ({ props }) => (
      <directionalLight
        position={toVec3(props.position)}
        color={props.color ?? undefined}
        intensity={props.intensity ?? 1}
      />
    ),

    Stars: ({ props }) => (
      <DreiStars
        radius={props.radius ?? 100}
        depth={props.depth ?? 50}
        count={props.count ?? 5000}
        factor={props.factor ?? 4}
        fade={props.fade ?? true}
        speed={props.speed ?? 1}
      />
    ),

    Label3D: ({ props }) => (
      <DreiText
        position={toVec3(props.position)}
        rotation={toVec3(props.rotation)}
        color={props.color ?? "#ffffff"}
        fontSize={props.fontSize ?? 1}
        anchorX={props.anchorX ?? "center"}
        anchorY={props.anchorY ?? "middle"}
      >
        {props.text}
      </DreiText>
    ),
  },
});

// =============================================================================
// Chart Helpers
// =============================================================================

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function processChartData(
  items: Array<Record<string, unknown>>,
  xKey: string,
  yKey: string,
  aggregate: "sum" | "count" | "avg" | null | undefined,
): { items: Array<Record<string, unknown>>; valueKey: string } {
  if (items.length === 0) {
    return { items: [], valueKey: yKey };
  }

  if (!aggregate) {
    const formatted = items.map((item) => ({
      ...item,
      label: String(item[xKey] ?? ""),
    }));
    return { items: formatted, valueKey: yKey };
  }

  const groups = new Map<string, Array<Record<string, unknown>>>();

  for (const item of items) {
    const groupKey = String(item[xKey] ?? "unknown");
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }

  const valueKey = aggregate === "count" ? "count" : yKey;
  const aggregated: Array<Record<string, unknown>> = [];
  const sortedKeys = Array.from(groups.keys()).sort();

  for (const key of sortedKeys) {
    const group = groups.get(key)!;
    let value: number;

    if (aggregate === "count") {
      value = group.length;
    } else if (aggregate === "sum") {
      value = group.reduce((sum, item) => {
        const v = item[yKey];
        return sum + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
      }, 0);
    } else {
      const sum = group.reduce((s, item) => {
        const v = item[yKey];
        return s + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
      }, 0);
      value = group.length > 0 ? sum / group.length : 0;
    }

    aggregated.push({ label: key, [valueKey]: value });
  }

  return { items: aggregated, valueKey };
}

// =============================================================================
// Fallback Component
// =============================================================================

export function Fallback({ type }: { type: string }) {
  return (
    <div className="p-4 border border-dashed rounded-lg text-muted-foreground text-sm">
      Unknown component: {type}
    </div>
  );
}
