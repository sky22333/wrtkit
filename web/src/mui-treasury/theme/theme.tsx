'use client';
import { createTheme } from '@mui/material/styles';
import type {} from '@mui/material/themeCssVarsAugmentation';

import { colors } from './colors';
import { alertTheme } from './components/alert';
import { buttonTheme } from './components/button';
import { chipTheme } from './components/chip';
import { controlsTheme } from './components/controls';
import { dialogTheme } from './components/dialog';
import { layoutTheme } from './components/layout';
import { menuTheme } from './components/menu';
import { selectTheme } from './components/select';
import { svgIconTheme } from './components/svg-icon';
import { tableTheme } from './components/table';
import { textFieldTheme } from './components/text-field';
import { shadows } from './shadows';
import { typography, typographyTheme } from './typography';

const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  colorSchemes: colors,
  shape: {
    borderRadius: 8,
  },
  components: {
    ...buttonTheme,
    ...textFieldTheme,
    ...selectTheme,
    ...menuTheme,
    ...chipTheme,
    ...tableTheme,
    ...dialogTheme,
    ...svgIconTheme,
    ...alertTheme,
    ...layoutTheme,
    ...controlsTheme,
    ...typographyTheme,
  },
  typography,
  shadows,
});

export default theme;
