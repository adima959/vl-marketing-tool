import type { ThemeConfig } from 'antd';
import { colors, borderRadius, fontSize, fontWeight, shadows, typography } from '@/styles/tokens';

const theme: ThemeConfig = {
  token: {
    // Primary color
    colorPrimary: colors.primary[500],

    // Background colors
    colorBgContainer: colors.background.primary,
    colorBgLayout: colors.background.secondary,
    colorBgElevated: colors.background.primary,

    // Border colors
    colorBorder: colors.gray[200],
    colorBorderSecondary: colors.gray[100],

    // Text colors
    colorText: colors.gray[900],
    colorTextSecondary: colors.gray[500],
    colorTextTertiary: colors.gray[400],
    colorTextQuaternary: colors.gray[300],

    // Typography
    fontSize: fontSize.md,
    fontFamily: typography.fontFamilyBase,
    fontSizeHeading1: typography.heading.h1.size,
    fontSizeHeading2: typography.heading.h2.size,
    fontSizeHeading3: typography.heading.h3.size,

    // Border radius
    borderRadius: borderRadius.md,
    borderRadiusLG: borderRadius.lg,
    borderRadiusSM: borderRadius.sm,

    // Shadows
    boxShadow: shadows.sm,
    boxShadowSecondary: shadows.md,
  },
  components: {
    Table: {
      headerBg: colors.gray[50],
      headerColor: colors.gray[700],
      rowHoverBg: colors.background.hover,
      borderColor: colors.gray[200],
      cellPaddingBlock: 12,
      cellPaddingInline: 12,
      cellFontSize: fontSize.sm,
      headerSplitColor: colors.gray[200],
      borderRadiusLG: borderRadius.lg,
      fontWeightStrong: fontWeight.semibold,
    },
    Button: {
      controlHeight: 36,
      controlHeightLG: 40,
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      primaryShadow: shadows.sm,
      borderRadius: borderRadius.md,
      colorPrimaryHover: colors.primary[600],
      colorPrimaryActive: colors.primary[700],
    },
    Select: {
      controlHeight: 36,
      controlHeightLG: 40,
      borderRadius: borderRadius.md,
      colorBorder: colors.gray[200],
    },
    DatePicker: {
      controlHeight: 36,
      controlHeightLG: 40,
      borderRadius: borderRadius.md,
      colorBorder: colors.gray[200],
    },
    Input: {
      controlHeight: 36,
      controlHeightLG: 40,
      borderRadius: borderRadius.md,
      colorBorder: colors.gray[200],
    },
    Tag: {
      defaultBg: colors.primary[500],
      defaultColor: colors.background.primary,
      borderRadiusSM: borderRadius.sm,
    },
    Modal: {
      headerBg: colors.background.primary,
      titleFontSize: fontSize.lg,
      titleLineHeight: 1.5,
      borderRadiusLG: borderRadius.lg,
      boxShadow: shadows.modal,
      contentBg: colors.background.primary,
    },
    Tabs: {
      inkBarColor: colors.primary[500],
      itemActiveColor: colors.primary[500],
      itemHoverColor: colors.primary[400],
      itemSelectedColor: colors.primary[600],
    },
    Alert: {
      colorErrorBg: '#fef2f2',
      colorErrorBorder: colors.semantic.error,
      colorSuccessBg: '#f0fdf4',
      colorSuccessBorder: colors.semantic.success,
      colorWarningBg: '#fffbeb',
      colorWarningBorder: colors.semantic.warning,
      colorInfoBg: '#eff6ff',
      colorInfoBorder: colors.semantic.info,
    },
  },
};

export default theme;
