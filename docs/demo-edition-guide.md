# TechOrbit Pharmacy POS Demo Edition

## Maqsad

Yeh build client demonstration aur product walkthrough ke liye hai. Is me isolated sample database hota hai. Isay live pharmacy, real customer records, real stock ya financial bookkeeping ke liye use na karein.

## Installation

1. `TechOrbit-PharmacyPOS-Demo-0.9.0-Setup.exe` run karein.
2. Agar Windows unsigned publisher warning dikhaye to installer ki SHA-256 value supplied manifest se verify karein. Production release ke liye signed installer alag release gate hai.
3. Installation ke baad **TechOrbit Pharmacy POS Demo** open karein.

Portable alternative ke liye ZIP extract karke `TechOrbit Pharmacy POS Demo.exe` run karein. Node.js, npm ya internet connection required nahi.

## Login

- Username: `demo`
- Password: `TechOrbit-Demo-2026!`

Yeh credentials sirf isolated Demo Edition database ke liye hain.

## Recommended client walkthrough

1. Dashboard par sales, stock, expiry aur dues indicators dikhayein.
2. Point of Sale me barcode/search, unit selection, discounts, batch allocation, warnings aur payment flow dikhayein.
3. Products aur Inventory me product master, packs, batches, opening stock aur stock adjustment dikhayein.
4. Purchases me supplier, purchase receiving aur purchase history dikhayein.
5. Accounts me customers, dues, supplier/vendor settlements aur expenses dikhayein.
6. Sales History me invoice detail, receipt, customer history aur return start dikhayein.
7. Closing me shift/day/six-month closing views dikhayein.
8. Reports me available operational aur financial reports, filters aur exports dikhayein.

## Demo reset

Settings khol kar **Reset demo data** select karein. Confirmation ke baad demo ke dauran banayi gayi entries remove ho jati hain aur original sample database dobara seed hota hai. Reset ke baad login dobara karna hota hai.

## Demo boundaries

- Real operational data import na karein.
- Physical scanner aur 80mm printer acceptance is demo build ka certified hissa nahi.
- Production backup/restore, migration, signed installer, complete role/security acceptance aur go-live gates abhi separate roadmap work hain.
- Client ko Demo Edition ko production-ready release ke taur par present na karein.
