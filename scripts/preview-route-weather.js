/**
 * Prints the weather section for a route using live MET Norway data, and
 * writes the full email HTML to a file for previewing. Sends no email.
 *
 *   node scripts/preview-route-weather.js "Улаанбаатар - Цагаанхад" 2026-10-28 [out.html]
 */
import fs from "fs";
import { getRouteWeather } from "../api/_route-weather.js";
import { buildHtml, buildText } from "../api/_form-mail.js";

const [direction = "Улаанбаатар - Цагаанхад", travelDate, outFile] = process.argv.slice(2);
const date = travelDate || new Date(Date.now() + 8 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().slice(0, 10);

const form = {
  company: "Говьхангайн Хөдөлмөр ХХК",
  department: "IT",
  travelDate: date,
  direction,
  otherDirection: "",
  transport: "Байгууллагын унаагаар",
  driver: "Жишээ 88000000",
  vehicle: "Жишээ машин"
};
const employees = [{ name: "Жишээ Ажилтан", position: "Жишээ", phone: "00000000" }];

const weather = await getRouteWeather(form);
console.log(buildText(form, employees, weather));

if (outFile) {
  fs.writeFileSync(outFile, buildHtml(form, employees, false, weather));
  console.log(`\nHTML written to ${outFile}`);
}
