export interface FacilityOption {
  id: string;
  name: string;
  description: string;
  category: 'production' | 'processing' | 'finishing' | 'quality';
}

export const FACTORY_FACILITIES: FacilityOption[] = [
  { id: 'knitting', name: 'Knitting', description: 'Circular and flat knitting machines, yarn cone creels', category: 'production' },
  { id: 'dyeing', name: 'Dyeing', description: 'Yarn and fabric dyeing vessels, liquor ratio control', category: 'processing' },
  { id: 'dyeing-finishing', name: 'Dyeing Finishing', description: 'Stenter, compactor, drying tumblers, de-twister', category: 'processing' },
  { id: 'cutting', name: 'Cutting', description: 'Auto-spreaders, band knives, laser/CAD cutters, fusing', category: 'production' },
  { id: 'printing', name: 'Printing', description: 'Screen, rotary, digital sublimation, heat transfer presses', category: 'processing' },
  { id: 'embroidery', name: 'Embroidery', description: 'Multi-head computerized embroidery machines', category: 'processing' },
  { id: 'sewing', name: 'Sewing', description: 'Lockstitch, overlock, flatlock, feed-off-the-arm lines', category: 'production' },
  { id: 'ironing', name: 'Ironing', description: 'Steam vacuum tables, buck press, garment steamer tunnels', category: 'finishing' },
  { id: 'finishing', name: 'Finishing', description: 'Thread trimming, stain removal, button attachment', category: 'finishing' },
  { id: 'packing', name: 'Packing', description: 'Polybag packaging, tagging, carton assortment, palletizing', category: 'finishing' },
  { id: 'warehouse', name: 'Warehouse', description: 'Fabric rolls, trims racking, chemical store, finished goods', category: 'production' },
  { id: 'physical-lab', name: 'Physical Lab Facilities', description: 'Washing fastness, crockmeter, GSM cutter, tensile tester, lightbox', category: 'quality' },
];
