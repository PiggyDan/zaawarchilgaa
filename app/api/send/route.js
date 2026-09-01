import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req) {
  try {
    const body = await req.json();

    const { data, error } = await resend.emails.send({
        from: "Travel Form <noreply@gkllc.mn>",
        to: [
          "admin@gkllc.mn",
          "it@gkllc.mn"
        ],
        subject: "Аяллын аюулгүй Зааварчилгааны маягт",
        html: htmlContent
      });

      if (error) {
        console.error("RESEND ERROR:", error);
        return Response.json({ error }, { status: 500 });
      }

return Response.json({ success: true, data });

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
