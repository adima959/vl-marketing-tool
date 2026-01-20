import type { ThemeConfig } from 'antd';
import { colors, borderRadius, fontSize, fontWeight, shadows } from '@/styles/tokens';

const theme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    borderRadius: borderRadius.md,
    colorBgContainer: colors.background.white,
    colorBorder: '#d9d9d9',
    colorText: colors.text.heading,
    colorTextSecondary: '#595959',
    fontSize: fontSize.md,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Table: {
      headerBg: colors.background.lighter,
      headerColor: colors.text.heading,
      rowHoverBg: colors.background.hoverAlt,
      borderColor: '#f0f0f0',
      cellPaddingBlock: 12,
      cellPaddingInline: 12,
      cellFontSize: fontSize.sm,
      headerSplitColor: colors.border.medium,
      borderRadiusLG: borderRadius.lg,
    },
    Button: {
      controlHeight: 36,
      controlHeightLG: 40,
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      primaryShadow: shadows.button,
      borderRadius: borderRadius.md,
    },
    Select: {
      controlHeight: 36,
      controlHeightLG: 40,
      borderRadius: borderRadius.md,
    },
    DatePicker: {
      controlHeight: 36,
      controlHeightLG: 40,
      borderRadius: borderRadius.md,
    },
    Input: {
      controlHeight: 36,
      controlHeightLG: 40,
      borderRadius: borderRadius.md,
    },
    Tag: {
      defaultBg: colors.primary,
      defaultColor: colors.background.white,
      borderRadiusSM: borderRadius.sm,
    },
    Modal: {
      headerBg: colors.background.white,
      titleFontSize: fontSize.lg,
      titleLineHeight: 1.5,
      borderRadiusLG: borderRadius.lg,
    },
    Tabs: {
      inkBarColor: colors.primary,
      itemActiveColor: colors.primary,
      itemHoverColor: colors.primary,
      itemSelectedColor: colors.primary,
    },
  },
};

export default theme;
