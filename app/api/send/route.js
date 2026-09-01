import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req) {
  try {
    const body = await req.json();

    const { data, error } = await resend.emails.send({
      from: "Office Form <noreply@office.gkllc.mn>",
      to: ["admin@gkllc.mn", "it@gkllc.mn"],
      subject: "Шинэ томилолтын хүсэлт",
      html: `
        <h2>Шинэ хүсэлт</h2>
        <p><strong>Нэр:</strong> ${body.name || ""}</p>
        <p><strong>Компани:</strong> ${body.company || ""}</p>
        <p><strong>Утас:</strong> ${body.phone || ""}</p>
      `,
    });

    if (error) {
      console.error("RESEND ERROR:", error);
      return NextResponse.json(
        {
          success: false,
          error,
        },
        { status: 500 }
      );
    }

    console.log("EMAIL SENT:", data);

    return NextResponse.json({
      success: true,
      emailId: data.id,
    });
  } catch (err) {
    console.error("API ERROR:", err);

    return NextResponse.json(
      {
        success: false,
        error: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
