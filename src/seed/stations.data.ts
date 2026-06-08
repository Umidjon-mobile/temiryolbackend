export interface SeedStation {
  id: string;
  nodeId: string;
  name: string;
  slug: string;
  workerCodes: string[];
  reserveCodes: string[];
}

export const STATIONS: SeedStation[] = [
  // РЖУ-Тошкент
  { id: 'toshkent', nodeId: 'rju-toshkent', name: 'Toshkent', slug: 'toshkent', workerCodes: ['1225', '1233', '1244', '1255'], reserveCodes: ['2121', '2132'] },
  { id: 'angren', nodeId: 'rju-toshkent', name: 'Angren', slug: 'angren', workerCodes: ['1266', '1277', '1288', '1299'], reserveCodes: ['2223', '2234'] },
  { id: 'sirdaryo', nodeId: 'rju-toshkent', name: 'Sirdaryo', slug: 'sirdaryo', workerCodes: ['1300', '1313', '1322', '1334'], reserveCodes: ['2289', '2300'] },
  { id: 'hovos', nodeId: 'rju-toshkent', name: 'Hovos', slug: 'hovos', workerCodes: ['1345', '1356', '1367', '1378'], reserveCodes: ['2312', '2323'] },
  { id: 'jizzax', nodeId: 'rju-toshkent', name: 'Jizzax', slug: 'jizzax', workerCodes: ['1389', '1400', '1414', '1423'], reserveCodes: ['2334', '2345'] },

  // РЖУ-Қўқон
  { id: 'andijon', nodeId: 'rju-qoqon', name: 'Andijon', slug: 'andijon', workerCodes: ['1432', '1445', '1456', '1467'], reserveCodes: ['2356', '2367'] },
  { id: 'qoqon', nodeId: 'rju-qoqon', name: 'Qoqon', slug: 'qoqon', workerCodes: ['1478', '1489', '1500', '1515'], reserveCodes: ['2378', '2389'] },
  { id: 'marglon', nodeId: 'rju-qoqon', name: "Marg'lon", slug: 'marglon', workerCodes: ['1524', '1535', '1546', '1557'], reserveCodes: ['2400', '2413'] },

  // РЖУ-Бухоро
  { id: 'samarqand', nodeId: 'rju-buxoro', name: 'Samarqand', slug: 'samarqand', workerCodes: ['1568', '1579', '1600', '1616'], reserveCodes: ['2401', '2414'] },
  { id: 'ziyovuddin', nodeId: 'rju-buxoro', name: 'Ziyovuddin', slug: 'ziyovuddin', workerCodes: ['1625', '1636', '1647', '1658'], reserveCodes: ['2402', '2415'] },
  { id: 'buxoro', nodeId: 'rju-buxoro', name: 'Buxoro', slug: 'buxoro', workerCodes: ['1669', '1700', '1717', '1726'], reserveCodes: ['2424', '2435'] },
  { id: 'tinchlik', nodeId: 'rju-buxoro', name: 'Tinchlik', slug: 'tinchlik', workerCodes: ['1737', '1748', '1759', '1800'], reserveCodes: ['2425', '2436'] },
  { id: 'uchquduq', nodeId: 'rju-buxoro', name: 'Uchquduq', slug: 'uchquduq', workerCodes: ['1818', '1827', '1838', '1849'], reserveCodes: ['2446', '2457'] },

  // РЖУ-Кунғирот
  { id: 'qongirot', nodeId: 'rju-qongirot', name: "Qo'ng'irot", slug: 'qongirot', workerCodes: ['1900', '1919', '1928', '1939'], reserveCodes: ['2468', '2479'] },
  { id: 'urganch', nodeId: 'rju-qongirot', name: 'Urganch', slug: 'urganch', workerCodes: ['2002', '2010', '2020', '2030'], reserveCodes: ['2500', '2514'] },
  { id: 'miskin', nodeId: 'rju-qongirot', name: 'Miskin', slug: 'miskin', workerCodes: ['2040', '2050', '2060', '2070'], reserveCodes: ['2525', '2536'] },

  // РЖУ-Қарши
  { id: 'qarshi', nodeId: 'rju-qarshi', name: 'Qarshi', slug: 'qarshi', workerCodes: ['2080', '2090', '2100', '2112'], reserveCodes: ['2547', '2558'] },

  // РЖУ-Термиз
  { id: 'termez', nodeId: 'rju-termiz', name: 'Termez', slug: 'termez', workerCodes: ['2143', '2154', '2165', '2176'], reserveCodes: ['2569', '2600'] },
  { id: 'darband', nodeId: 'rju-termiz', name: 'Darband', slug: 'darband', workerCodes: ['2187', '2198', '2200', '2211'], reserveCodes: ['2659', '2700'] },
  { id: 'qumqurgon', nodeId: 'rju-termiz', name: "Qumqurg'on", slug: 'qumqurgon', workerCodes: ['2245', '2256', '2267', '2278'], reserveCodes: ['2637', '2648'] },
];
