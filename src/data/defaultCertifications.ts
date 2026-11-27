import { FactoryCertification } from '../types/audit';

export const DEFAULT_CERTIFICATIONS: FactoryCertification[] = [
  { id: 'iso9001', name: 'ISO 9001', selected: false },
  { id: 'wrap', name: 'WRAP (Worldwide Responsible Accredited Production)', selected: false },
  { id: 'oeko-tex', name: 'OEKO-TEX Standard 100', selected: false },
  { id: 'bsci', name: 'BSCI', selected: false },
  { id: 'sedex', name: 'SEDEX SMETA', selected: false },
  { id: 'iso14001', name: 'ISO 14001', selected: false },
  { id: 'gots', name: 'GOTS', selected: false },
  { id: 'higg', name: 'Higg FEM', selected: false },
  { id: 'grs', name: 'GRS', selected: false },
];
