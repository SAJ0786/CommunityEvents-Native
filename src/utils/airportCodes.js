// IATA codes for Australian cities and towns served by an airport, keyed by "name|STATE".
const AIRPORTS = {
  'adelaide|SA': 'ADL', 'albany|WA': 'ALH', 'albury|NSW': 'ABX', 'alice springs|NT': 'ASP', 'armidale|NSW': 'ARM',
  'ballina|NSW': 'BNK', 'bathurst|NSW': 'BHS', 'bendigo|VIC': 'BXG', 'broken hill|NSW': 'BHQ', 'broome|WA': 'BME',
  'brisbane|QLD': 'BNE', 'bunbury|WA': 'BUY', 'bundaberg|QLD': 'BDB', 'burnie|TAS': 'BWT', 'busselton|WA': 'BQB',
  'cairns|QLD': 'CNS', 'canberra|ACT': 'CBR', 'carnarvon|WA': 'CVQ', 'ceduna|SA': 'CED', 'charleville|QLD': 'CTL',
  'cloncurry|QLD': 'CNJ', 'cobar|NSW': 'CAZ', 'coffs harbour|NSW': 'CFS', 'coober pedy|SA': 'CPD', 'darwin|NT': 'DRW',
  'devonport|TAS': 'DPO', 'dubbo|NSW': 'DBO', 'emerald|QLD': 'EMD', 'esperance|WA': 'EPR', 'exmouth|WA': 'LEA',
  'geraldton|WA': 'GET', 'gladstone|QLD': 'GLT', 'gold coast|QLD': 'OOL', 'grafton|NSW': 'GFN', 'griffith|NSW': 'GFF',
  'hervey bay|QLD': 'HVB', 'hobart|TAS': 'HBA', 'inverell|NSW': 'IVR', 'kalgoorlie|WA': 'KGI', 'karratha|WA': 'KTA',
  'katherine|NT': 'KTR', 'kingscote|SA': 'KGC', 'kununurra|WA': 'KNX', 'launceston|TAS': 'LST', 'lismore|NSW': 'LSY',
  'longreach|QLD': 'LRE', 'mackay|QLD': 'MKY', 'maroochydore|QLD': 'MCY', 'melbourne|VIC': 'MEL', 'merimbula|NSW': 'MIM',
  'mildura|VIC': 'MQL', 'moree|NSW': 'MRZ', 'moruya|NSW': 'MYA', 'mount gambier|SA': 'MGB', 'mount isa|QLD': 'ISA',
  'narrabri|NSW': 'NAA', 'newcastle|NSW': 'NTL', 'orange|NSW': 'OAG', 'parkes|NSW': 'PKE', 'perth|WA': 'PER',
  'port hedland|WA': 'PHE', 'port lincoln|SA': 'PLO', 'port macquarie|NSW': 'PQQ', 'rockhampton|QLD': 'ROK',
  'roma|QLD': 'RMA', 'shepparton|VIC': 'SHT', 'sunshine coast|QLD': 'MCY', 'sydney|NSW': 'SYD', 'tamworth|NSW': 'TMW',
  'tennant creek|NT': 'TCA', 'toowoomba|QLD': 'WTB', 'townsville|QLD': 'TSV', 'wagga wagga|NSW': 'WGA',
  'warrnambool|VIC': 'WMB', 'weipa|QLD': 'WEI', 'whyalla|SA': 'WYA', 'wollongong|NSW': 'WOL',
};

// City labels look like "Newcastle, NSW, Australia".
export function suggestCityCode(city) {
  const name = String(city?.label || '').split(',')[0].trim().toLowerCase();
  const state = String(city?.state || '').toUpperCase();
  return AIRPORTS[`${name}|${state}`] || '';
}
