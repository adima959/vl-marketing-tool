import type { ThemeConfig } from 'antd';

const theme: ThemeConfig = {
  token: {
    colorPrimary: '#00B96B',
    borderRadius: 6,
    colorBgContainer: '#ffffff',
    colorBorder: '#d9d9d9',
    colorText: '#262626',
    colorTextSecondary: '#595959',
    fontSize: 14,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Table: {
      headerBg: '#f5f5f5',
      headerColor: '#262626',
      rowHoverBg: '#f0f9ff',
      borderColor: '#f0f0f0',
      cellPaddingBlock: 12,
      cellPaddingInline: 12,
      cellFontSize: 13,
      headerSplitColor: '#e0e0e0',
      borderRadiusLG: 8,
    },
    Button: {
      controlHeight: 36,
      controlHeightLG: 40,
      fontSize: 14,
      fontWeight: 500,
      primaryShadow: '0 1px 2px rgba(0, 185, 107, 0.2)',
      borderRadius: 6,
    },
    Select: {
      controlHeight: 36,
      controlHeightLG: 40,
      borderRadius: 6,
    },
    DatePicker: {
      controlHeight: 36,
      controlHeightLG: 40,
      borderRadius: 6,
    },
    Input: {
      controlHeight: 36,
      controlHeightLG: 40,
      borderRadius: 6,
    },
    Tag: {
      defaultBg: '#00B96B',
      defaultColor: '#ffffff',
      borderRadiusSM: 4,
    },
    Modal: {
      headerBg: '#ffffff',
      titleFontSize: 16,
      titleLineHeight: 1.5,
      borderRadiusLG: 8,
    },
    Tabs: {
      inkBarColor: '#00B96B',
      itemActiveColor: '#00B96B',
      itemHoverColor: '#00B96B',
      itemSelectedColor: '#00B96B',
    },
  },
};

export default theme;
