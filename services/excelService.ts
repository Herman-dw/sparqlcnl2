
import * as XLSX from 'xlsx';

export const downloadAsExcel = (results: any[], metadata: any) => {
  const wb = XLSX.utils.book_new();

  // Results sheet
  const resultsWs = XLSX.utils.json_to_sheet(results);
  XLSX.utils.book_append_sheet(wb, resultsWs, 'Results');

  // Metadata sheet
  const metadataData = [
    ['Vraag', metadata.vraag],
    ['SPARQL Query', metadata.sparql],
    ['Timestamp', metadata.timestamp.toISOString()],
    ['Endpoint', metadata.endpoint || 'CompetentNL SPARQL Endpoint'],
    ['Gebruikte Graphs', metadata.graphs?.join(', ') || 'N/A']
  ];
  const metadataWs = XLSX.utils.aoa_to_sheet(metadataData);
  XLSX.utils.book_append_sheet(wb, metadataWs, 'Metadata');

  // Save the file
  XLSX.writeFile(wb, `competentnl_export_${new Date().getTime()}.xlsx`);
};
