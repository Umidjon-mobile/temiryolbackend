export interface SeedNode {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
}

export const NODES: SeedNode[] = [
  {
    id: 'rju-toshkent',
    name: 'РЖУ-Тошкент',
    slug: 'rju-toshkent',
    description: 'Markaziy uzel',
    icon: 'LayoutGrid',
  },
  {
    id: 'rju-qoqon',
    name: 'РЖУ-Қўқон',
    slug: 'rju-qoqon',
    description: "Vodiy tarmog'i",
    icon: 'Network',
  },
  {
    id: 'rju-buxoro',
    name: 'РЖУ-Бухоро',
    slug: 'rju-buxoro',
    description: "Tarixiy yo'nalish",
    icon: 'History',
  },
  {
    id: 'rju-qongirot',
    name: 'РЖУ-Кунғирот',
    slug: 'rju-qongirot',
    description: 'Shimoliy ufq',
    icon: 'Compass',
  },
  {
    id: 'rju-qarshi',
    name: 'РЖУ-Қарши',
    slug: 'rju-qarshi',
    description: 'Janubiy hudud',
    icon: 'MapPin',
  },
  {
    id: 'rju-termiz',
    name: 'РЖУ-Термиз',
    slug: 'rju-termiz',
    description: 'Chegara stansiyasi',
    icon: 'Flag',
  },
];
