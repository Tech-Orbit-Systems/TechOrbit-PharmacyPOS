const fields=['salesMinor','customerReturnsMinor','netSalesMinor','gstMinor','cogsMinor','grossProfitMinor','expensesMinor','operatingProfitMinor','purchasesMinor','purchaseReturnsMinor','savingsTransferredMinor'];
const labels=['sales','customer returns','net sales','GST','COGS','gross profit','expenses','operating profit','purchases','purchase returns','actual savings transfers'];
const cell=value=>'"'+String(value).replaceAll('"','""')+'"';
function periodCsv(report){
  const rows=[
    ['TechOrbit Pharmacy POS six-month report'],
    ['From UTC',report.from],['To UTC exclusive',report.asOf],['Cycle start month',report.cycleStartMonth],
    ['Month',...labels],
    ...report.months.map(month=>[month.month,...fields.map(field=>month[field]/100)]),
    ['Total',...fields.map(field=>report.totals[field]/100)],
  ];
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
module.exports={periodCsv};
