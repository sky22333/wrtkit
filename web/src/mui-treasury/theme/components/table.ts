import { paginationItemClasses } from '@mui/material/PaginationItem';
import { tableRowClasses } from '@mui/material/TableRow';

import type { ThemeComponents } from '../types';

export const tableTheme: ThemeComponents = {
  MuiTable: {
    styleOverrides: {
      root: {
        tableLayout: 'fixed',
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderBottomColor: (theme.vars || theme).palette.divider,
        fontSize: theme.typography.body2.fontSize,
        padding: '14px 24px 14px 12px',
      }),
      head: ({ theme }) => ({
        fontWeight: 600,
        color: (theme.vars || theme).palette.text.primary,
        backgroundColor: `color-mix(in srgb, ${
          (theme.vars || theme).palette.secondary.main
        }, ${(theme.vars || theme).palette.common.background} 60%)`,
      }),
      sizeSmall: {
        padding: '6px 16px 6px 12px',
      },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: ({ theme }) => ({
        'tbody > &:last-child td, tbody > &:last-child th': {
          borderBottom: 0,
        },
        [`&.${tableRowClasses.hover}:hover`]: {
          backgroundColor: (theme.vars || theme).palette.action.hover,
        },
        [`&.${tableRowClasses.selected}`]: {
          backgroundColor: (theme.vars || theme).palette.action.selected,
          '&:hover': {
            backgroundColor: (theme.vars || theme).palette.action.selected,
          },
        },
      }),
    },
  },
  MuiPaginationItem: {
    styleOverrides: {
      root: ({ theme }) => ({
        [`&.${paginationItemClasses.focusVisible}`]: {
          outline: '2px solid',
          outlineColor: (theme.vars || theme).palette.text.primary,
          outlineOffset: '2px',
        },
      }),
    },
  },
};
