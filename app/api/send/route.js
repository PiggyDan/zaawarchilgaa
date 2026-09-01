import nodemailer from "nodemailer";

export async function POST(req) {
  try {
    const body = await req.json();

    const transporter = nodemailer.createTransport({
      host: "smtp.mail.mn",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const { data, error } = await resend.emails.send({
      from: "Travel Form <noreply@office.gkllc.mn>",

      to: [
        "admin@gkllc.mn",
        "it@gkllc.mn",
        "share@gkllc.mn",
      ],
      subject: "Аяллын аюулгүй зааварчилгаа маягт",

      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Аяллын аюулгүй ажиллагааны маягт</h2>

          <p><strong>Компани:</strong> ${body.company || ""}</p>
          <p><strong>Хэлтэс:</strong> ${body.department || ""}</p>
          <p><strong>Аялах өдөр:</strong> ${body.travelDate || ""}</p>
          <p><strong>Чиглэл:</strong> ${body.route || ""}</p>
        </div>
      `,
    });

    console.log("EMAIL SENT:", info.messageId);

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
    console.error("SMTP ERROR:", error);

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
