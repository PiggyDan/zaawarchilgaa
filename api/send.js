import { Resend } from "resend";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { form, employees, signature } = req.body || {};

  if (!form || !employees) {
    return res.status(400).json({ error: "Missing form data" });
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing RESEND_API_KEY" });
  }

  const resend = new Resend(apiKey);

  const html = `
    <div style="font-family:Arial,sans-serif; color:#111827; line-height:1.5;">
      <h2 style="margin:0 0 12px;">Аяллын аюулгүй ажиллагааны маягт</h2>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; max-width:700px;">
        <tr><td style="padding:6px 0; width:180px;">Компани</td><td>${form.company || "-"}</td></tr>
        <tr><td style="padding:6px 0;">Хэлтэс</td><td>${form.department || "-"}</td></tr>
        <tr><td style="padding:6px 0;">Аялах өдөр</td><td>${form.travelDate || "-"}</td></tr>
        <tr><td style="padding:6px 0;">Чиглэл</td><td>${form.direction === "Бусад" ? (form.otherDirection || "-") : (form.direction || "-")}</td></tr>
        <tr><td style="padding:6px 0;">Тээврийн хэрэгсэл</td><td>${form.transport || "-"}</td></tr>
        <tr><td style="padding:6px 0;">Жолооч</td><td>${form.driver || "-"}</td></tr>
        <tr><td style="padding:6px 0;">Машин</td><td>${form.vehicle || "-"}</td></tr>
        ${employees
          .map(
            (employee, index) => `
              <tr><td colspan="2" style="padding:12px 0 6px; font-weight:700;">Ажилтан ${index + 1}</td></tr>
              <tr><td style="padding:6px 0;">Овог нэр</td><td>${employee.name || "-"}</td></tr>
              <tr><td style="padding:6px 0;">Албан тушаал</td><td>${employee.position || "-"}</td></tr>
              <tr><td style="padding:6px 0;">Утас</td><td>${employee.phone || "-"}</td></tr>
            `
          )
          .join("")}
        <tr>
          <td style="padding:12px 0 6px; vertical-align:top;">Гарын үсэг</td>
          <td style="padding:12px 0 6px;">
            ${signature ? `<img src="${signature}" alt="Signature" style="max-width:220px; max-height:120px; border:1px solid #d1d5db; border-radius:6px;" />` : "Ороогүй"}
          </td>
        </tr>
      </table>
    </div>
  `;

  try {
    const emailResponse = await resend.emails.send({
      from: "GKLLC Office <noreply@gkllc.mn>",
      to: ["admin@gkllc.mn", "it@gkllc.mn"],
      subject: `New travel safety form - ${form.company || "Company"}`,
      html,
      text: `Travel safety form\n\nCompany: ${form.company || "-"}\nDepartment: ${form.department || "-"}\nTravel date: ${form.travelDate || "-"}\nDirection: ${form.direction === "Бусад" ? form.otherDirection || "-" : form.direction || "-"}\nTransport: ${form.transport || "-"}\nDriver: ${form.driver || "-"}\nVehicle: ${form.vehicle || "-"}\n\nEmployees:\n${employees
        .map(
          (employee, index) =>
            `- ${index + 1}: ${employee.name || "-"}, ${employee.position || "-"}, ${employee.phone || "-"}`
        )
        .join("\n")}`
    });

    return res.status(200).json({ success: true, id: emailResponse?.id || null });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
