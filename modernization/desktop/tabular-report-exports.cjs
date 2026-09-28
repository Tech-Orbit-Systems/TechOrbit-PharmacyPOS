const filename=(title,extension)=>`TechOrbit_${title.replace(/[^a-zA-Z0-9]+/g,'_')}.${extension}`;
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
function csvReport(r){
 const rows=[[r.title],...r.metadata,[],r.headers,...r.rows,[],...r.totals];
 return {filename:filename(r.title,'csv'),csv:'\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function xlsxReport(r){
 const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Report');
 sheet.addRow([r.title]);for(const row of r.metadata)sheet.addRow(row);sheet.addRow([]);
 const header=sheet.addRow(r.headers);header.font={bold:true};
 for(const row of r.rows)sheet.addRow(row);sheet.addRow([]);for(const row of r.totals)sheet.addRow(row);
 sheet.getRow(1).font={bold:true,size:14};sheet.columns=r.headers.map(()=>({width:24}));
 return {filename:filename(r.title,'xlsx'),base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function pdfReport(r){
 const {jsPDF}=require('jspdf'),doc=new jsPDF({unit:'pt',format:'a4'});let y=42;
 const line=value=>{for(const text of doc.splitTextToSize(String(value),510)){if(y>780){doc.addPage();y=42}doc.text(text,42,y);y+=15}};
 line(r.title);for(const row of r.metadata)line(row.join(': '));for(const row of r.totals)line(row.join(': '));
 for(const row of r.rows){y+=8;for(let i=0;i<r.headers.length;i++)line(`${r.headers[i]}: ${row[i]??''}`)}
 return {filename:filename(r.title,'pdf'),base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={csvReport,xlsxReport,pdfReport};
