import {
  Baby,
  BookOpen,
  Car,
  CircleQuestionMark,
  Coffee,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  Smartphone,
  Tag,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';

/** Icon names stored on categories (kebab-case, as in lucide). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  car: Car,
  fuel: Fuel,
  plane: Plane,
  'shopping-bag': ShoppingBag,
  shirt: Shirt,
  receipt: Receipt,
  zap: Zap,
  wifi: Wifi,
  smartphone: Smartphone,
  house: House,
  film: Film,
  'gamepad-2': Gamepad2,
  'heart-pulse': HeartPulse,
  dumbbell: Dumbbell,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  baby: Baby,
  'paw-print': PawPrint,
  gift: Gift,
  wrench: Wrench,
  wallet: Wallet,
  'piggy-bank': PiggyBank,
  tag: Tag,
};

export const CATEGORY_COLORS = [
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#4F46E5',
  '#3B82F6',
  '#06B6D4',
  '#10B981',
  '#84CC16',
  '#A16207',
  '#64748B',
  '#0F172A',
];

export function CategoryIcon({
  icon,
  color,
  size = 36,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: number;
}) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || (icon ? Tag : CircleQuestionMark);
  const tint = color ?? '#94A3B8';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        // 8-digit hex: the category colour at ~13% opacity
        backgroundColor: `${tint}22`,
      }}
    >
      <Icon color={tint} size={size * 0.5} />
    </View>
  );
}
