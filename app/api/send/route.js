import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req) {
  try {
    const body = await req.json();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Аяллын аюулгүй ажиллагааны маягт</h2>

        <p><strong>Компани:</strong> ${body.company || ""}</p>
        <p><strong>Хэлтэс:</strong> ${body.department || ""}</p>
        <p><strong>Аялах өдөр:</strong> ${body.travelDate || ""}</p>
        <p><strong>Чиглэл:</strong> ${body.route || ""}</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: "Travel Form <noreply@office.gkllc.mn>",

      to: [
        "admin@gkllc.mn",
        "it@gkllc.mn",
        "share@gkllc.mn",
      ],

      subject: "Аяллын аюулгүй зааварчилгаа маягт",
      html: htmlContent,
    });

    if (error) {
      console.error("RESEND ERROR:", error);

      return Response.json(
        {
          success: false,
          error: error.message || error,
        },
        {
          status: 500,
        }
      );
    }

    console.log("EMAIL SENT:", data);

    return Response.json({
      success: true,
      id: data.id,
    });

  } catch (error) {
    console.error("API ERROR:", error);

    return Response.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}