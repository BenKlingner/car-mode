import type { PluginScreenProps } from "@getpaseo/plugin/client";

type PluginTheme = PluginScreenProps["theme"];
import { Icon } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import type { CarStatus } from "./agents";

/** Sizes tuned for a touch screen at arm's length. Compact windows scale down a little. */
export function sizesFor(compact: boolean) {
  const k = compact ? 0.85 : 1;
  return {
    pad: Math.round(28 * k),
    gap: Math.round(16 * k),
    radius: 18,
    small: Math.round(18 * k),
    body: Math.round(22 * k),
    title: Math.round(30 * k),
    heading: Math.round(36 * k),
    button: Math.round(24 * k),
    buttonHeight: Math.round(76 * k),
  };
}

export type Sizes = ReturnType<typeof sizesFor>;

/** The same size set scaled down or up, for denser parts of a screen. */
export function scaleSizes(sizes: Sizes, k: number): Sizes {
  return {
    pad: Math.round(sizes.pad * k),
    gap: Math.round(sizes.gap * k),
    radius: Math.round(sizes.radius * k),
    small: Math.round(sizes.small * k),
    body: Math.round(sizes.body * k),
    title: Math.round(sizes.title * k),
    heading: Math.round(sizes.heading * k),
    button: Math.round(sizes.button * k),
    buttonHeight: Math.round(sizes.buttonHeight * k),
  };
}

/** Sizes for a secondary text button that sits in a row with an IconButton. */
export function barButtonSizes(sizes: Sizes): Sizes {
  return {
    ...sizes,
    buttonHeight: iconButtonSide(sizes),
    button: Math.round(sizes.button * 0.8),
    pad: Math.round(sizes.pad * 0.7),
  };
}

/** The square icon button's side; other controls in the same row match it. */
export function iconButtonSide(sizes: Sizes): number {
  return Math.round(sizes.buttonHeight * 0.8);
}

type Tone = "accent" | "neutral" | "danger" | "success";

interface BigButtonProps {
  label: string;
  onPress: () => void;
  theme: PluginTheme;
  sizes: Sizes;
  tone?: Tone;
  disabled?: boolean;
  grow?: boolean;
  accessibilityLabel?: string;
}

export function BigButton({
  label,
  onPress,
  theme,
  sizes,
  tone = "neutral",
  disabled,
  grow,
  accessibilityLabel,
}: BigButtonProps) {
  const c = theme.colors;
  const fill =
    tone === "accent"
      ? c.accent
      : tone === "danger"
        ? c.statusDanger
        : tone === "success"
          ? c.statusSuccess
          : c.surface2;
  const text = tone === "neutral" ? c.foreground : c.accentForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: sizes.buttonHeight,
        minWidth: sizes.buttonHeight * 1.6,
        paddingHorizontal: sizes.pad,
        borderRadius: sizes.radius,
        backgroundColor: fill,
        borderWidth: tone === "neutral" ? 2 : 0,
        borderColor: c.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        flexGrow: grow ? 1 : 0,
        flexShrink: grow ? 1 : 0,
      })}
    >
      <Text style={{ color: text, fontSize: sizes.button, fontWeight: "700", textAlign: "center" }}>
        {label}
      </Text>
    </Pressable>
  );
}

const STATUS_LABEL: Record<CarStatus, string> = {
  "needs-you": "Needs you",
  working: "Working",
  error: "Error",
  finished: "Finished",
  idle: "Idle",
  closed: "Closed",
};

export function statusColor(status: CarStatus, theme: PluginTheme): string {
  const c = theme.colors;
  switch (status) {
    case "needs-you":
      return c.statusWarning;
    case "error":
      return c.statusDanger;
    case "working":
      return workingBlue(theme);
    case "finished":
      return c.statusSuccess;
    default:
      return c.foregroundMuted;
  }
}

/**
 * The theme has no blue token, so pick a blue that contrasts with the theme's background:
 * a lighter blue on dark themes, a deeper one on light themes.
 */
export function workingBlue(theme: PluginTheme): string {
  return isDark(theme.colors.surface0) ? "#60A5FA" : "#1D4ED8";
}

function isDark(color: string): boolean {
  const hex = color.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex) && !/^[0-9a-f]{3}$/i.test(hex)) return true;
  const full = hex.length === 3 ? hex.replace(/./g, (ch) => ch + ch) : hex.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

/** A pill in the same shape as StatusBadge, for helper activity. */
export function Pill({
  label,
  color,
  sizes,
}: {
  label: string;
  color: string;
  sizes: Sizes;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Math.round(sizes.small * 0.55),
        paddingHorizontal: Math.round(sizes.small * 0.9),
        paddingVertical: Math.round(sizes.small * 0.45),
        borderRadius: 999,
        borderWidth: 2,
        borderColor: color,
        alignSelf: "flex-start",
      }}
    >
      <View style={{ width: dot(sizes), height: dot(sizes), borderRadius: dot(sizes) / 2, backgroundColor: color }} />
      <Text style={{ color, fontSize: sizes.small, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

/** The agent's own status, plus a pill when its helpers are working or need you. */
export function StatusRow({
  status,
  helpersWorking,
  helpersNeedYou,
  theme,
  sizes,
}: {
  status: CarStatus;
  helpersWorking: number;
  helpersNeedYou: number;
  theme: PluginTheme;
  sizes: Sizes;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Math.round(sizes.small * 0.55) }}>
      <StatusBadge status={status} theme={theme} sizes={sizes} />
      {helpersNeedYou > 0 ? (
        <Pill
          label={helpersNeedYou === 1 ? "Helper needs you" : `${helpersNeedYou} helpers need you`}
          color={theme.colors.statusWarning}
          sizes={sizes}
        />
      ) : null}
      {helpersWorking > 0 ? (
        <Pill
          label={`${helpersWorking} ${helpersWorking === 1 ? "helper" : "helpers"} working`}
          color={workingBlue(theme)}
          sizes={sizes}
        />
      ) : null}
    </View>
  );
}

export function StatusBadge({
  status,
  theme,
  sizes,
}: {
  status: CarStatus;
  theme: PluginTheme;
  sizes: Sizes;
}) {
  const color = statusColor(status, theme);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Math.round(sizes.small * 0.55),
        paddingHorizontal: Math.round(sizes.small * 0.9),
        paddingVertical: Math.round(sizes.small * 0.45),
        borderRadius: 999,
        borderWidth: 2,
        borderColor: color,
        alignSelf: "flex-start",
      }}
    >
      <View style={{ width: dot(sizes), height: dot(sizes), borderRadius: dot(sizes) / 2, backgroundColor: color }} />
      <Text style={{ color, fontSize: sizes.small, fontWeight: "700" }}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** A square icon-only button, for secondary controls that don't need a label. */
export function IconButton({
  icon,
  label,
  onPress,
  theme,
  sizes,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  theme: PluginTheme;
  sizes: Sizes;
}) {
  const c = theme.colors;
  const side = iconButtonSide(sizes);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: side,
        height: side,
        borderRadius: sizes.radius,
        borderWidth: 2,
        borderColor: c.border,
        backgroundColor: c.surface2,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Icon name={icon} size={Math.round(side * 0.45)} color={c.foreground} />
    </Pressable>
  );
}

function dot(sizes: Sizes): number {
  return Math.round(sizes.small * 0.78);
}
