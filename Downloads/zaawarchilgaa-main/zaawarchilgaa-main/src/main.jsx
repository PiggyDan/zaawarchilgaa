import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronDown, ChevronUp, Plus, Trash2, CheckCircle2 } from "lucide-react";
import govikhangaiLogo from "./assets/logos/GKK.png";
import tsagaanhadLogo from "./assets/logos/tsagaanhad.png";
import guulingoviLogo from "./assets/logos/guulingovi.png";
import "./styles.css";

const emptyEmployee = () => ({ name: "", position: "", phone: "" });

const companyOptions = [
  {
    value: "Говьхангайн Хөдөлмөр ХХК",
    logo: govikhangaiLogo
  },
  {
    value: "Цагаанхад Мөнхийн Их ХХК",
    logo: tsagaanhadLogo
  },
  {
    value: "Гуулинговь ХХК",
    logo: guulingoviLogo
  }
];

const companyMap = Object.fromEntries(
  companyOptions.map((company) => [company.value, company])
);

const SIGNATURE_MAX_EDGE = 900;

/**
 * Reads a signature image and scales it down, so a phone photo does not
 * exceed the request body limit once base64-encoded.
 */
function readScaledImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const dataUrl = reader.result;
      const image = new Image();

      image.onerror = () => reject(new Error("decode failed"));
      image.onload = () => {
        const scale = Math.min(
          1,
          SIGNATURE_MAX_EDGE / Math.max(image.width, image.height)
        );

        if (scale === 1 && dataUrl.length < 700_000) {
          resolve(dataUrl);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };

      image.src = dataUrl;
    };

    reader.readAsDataURL(file);
  });
}

function CompanyLogo({ companyName }) {
  const selectedCompany = companyMap[companyName] || companyOptions[0];

  const className =
    companyName === "Цагаанхад Мөнхийн Их ХХК"
      ? "companyLogoSvg companyLogoSvg--tsagaanhad"
      : companyName === "Гуулинговь ХХК"
        ? "companyLogoSvg companyLogoSvg--guulingovi"
        : "companyLogoSvg companyLogoSvg--govikhangai";

  return (
    <img
      src={selectedCompany.logo}
      alt={companyName}
      className={className}
      draggable="false"
    />
  );
}

function App() {
  const [employees, setEmployees] = useState([emptyEmployee()]);
  const [showSafety, setShowSafety] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [signature, setSignature] = useState("");
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState({
    company: "Говьхангайн Хөдөлмөр ХХК",
    department: "",
    travelDate: "",
    direction: "",
    otherDirection: "",
    transport: "Байгууллагын унаагаар",
    driver: "",
    vehicle: ""
  });

  const selectedCompany = companyMap[form.company] || companyOptions[0];

  const updateForm = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const updateEmployee = (index, key, value) => {
    const next = [...employees];
    next[index] = { ...next[index], [key]: value };
    setEmployees(next);
  };

  const addEmployee = () => {
    if (employees.length < 4) {
      setEmployees([...employees, emptyEmployee()]);
    }
  };

  const removeEmployee = (index) => {
    if (employees.length === 1) return;
    setEmployees(employees.filter((_, i) => i !== index));
  };

  const submit = async (e) => {
    e.preventDefault();

    if (sending) return;

    const missing = [];

    if (!form.department.trim()) missing.push("Харьяалагдах хэлтэс");
    if (!form.travelDate) missing.push("Аялах өдөр");
    if (!form.direction) missing.push("Аялах чиглэл");
    if (form.direction === "Бусад" && !form.otherDirection.trim()) missing.push("Бусад явах чиглэл");
    if (!form.transport.trim()) missing.push("Аялах тээврийн хэрэгсэл");

    employees.forEach((employee, index) => {
      if (!employee.name.trim()) missing.push(`Ажилтан ${index + 1} - Овог нэр`);
      if (!employee.position.trim()) missing.push(`Ажилтан ${index + 1} - Албан тушаал`);
      if (!employee.phone.trim()) missing.push(`Ажилтан ${index + 1} - Утасны дугаар`);
    });

    if (!signature) missing.push("Гарын үсэг");
    if (!accepted) missing.push("Танилцсан нөхцөл");

    if (missing.length > 0) {
      alert(`Дутуу байна: ${missing[0]}`);
      return;
    }

    setSending(true);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          form,
          employees,
          signature
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to send the form.");
      }

      setSubmitted(true);
      setAccepted(false);
      setSignature("");
      setEmployees([emptyEmployee()]);
      setForm({
        company: "Говьхангайн Хөдөлмөр ХХК",
        department: "",
        travelDate: "",
        direction: "",
        otherDirection: "",
        transport: "Байгууллагын унаагаар",
        driver: "",
        vehicle: ""
      });
      setShowSafety(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      alert(error.message || "Илгээхэд асуудал гарлаа. Та дахин оролдоно уу.");
    } finally {
      setSending(false);
    }
  };

  const handleSignatureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSignature(await readScaledImage(file));
    } catch {
      alert("Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.");
    }
  };

  if (submitted) {
    return (
      <main className="page">
        <div className="formCard successScreen">
          <div className="success successScreenBox">
            <CheckCircle2 size={20} />
            <div>
              <strong>Амжилттай илгээгдлээ.</strong>
              <span>Аяллын мэдээлэл бүртгэгдлээ.</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="formCard">
        <header className="docHeader">
          <div className="logoBox">
            <CompanyLogo companyName={form.company} />
          </div>
          <div className="titleArea">
            <h1>АТҮТ БОЛОН ЗАМЫН УНААГААР ЗОРЧИХ ҮЕИЙН</h1>
            <h1>АЮУЛГҮЙ АЖИЛЛАГААНЫ ЗААВАРЧИЛГАА</h1>
            <div className="meta">
              <span>Хувилбар: 03</span>
              <span>Шинэчилсэн огноо: 2026.09.01</span>
            </div>
          </div>
        </header>

        <form onSubmit={submit}>
          <Section title="Үндсэн мэдээлэл">
            <Field label="Компани">
              <select name="company" value={form.company} onChange={updateForm}>
                {companyOptions.map((company) => (
                  <option key={company.value} value={company.value}>
                    {company.value}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Харьяалагдах хэлтэс *">
              <select
                required
                name="department"
                value={form.department}
                onChange={updateForm}
              >
                <option value="">Сонгох</option>
                <option value="Санхүү">Санхүү</option>
                <option value="Үйл ажиллагаа">Үйл ажиллагаа</option>
                <option value="Хүний нөөц">Хүний нөөц</option>
                <option value="Удирдлага">Удирдлага</option>
                <option value="IT">IТ</option>
                <option value="Хууль">Хууль</option>
                <option value="Захиргаа">Захиргаа</option>
                <option value="Бусад">Бусад</option>
              </select>
            </Field>

            <div className="twoCols">
              <Field label="Аялах өдөр *">
                <input
                  required
                  type="date"
                  name="travelDate"
                  value={form.travelDate}
                  onChange={updateForm}
                />
              </Field>

              <Field label="Аялах чиглэл *">
                <select
                  required
                  name="direction"
                  value={form.direction}
                  onChange={updateForm}
                >
                  <option value="">Сонгох</option>
                  <option>Улаанбаатар - Даланзадгад</option>
                  <option>Улаанбаатар - Цагаанхад</option>
                  <option>Улаанбаатар - Шивээхүрэн</option>
                  <option>Улаанбаатар - Гурвантэс</option>
                  <option>Даланзадгад - Гурвантэс</option>
                  <option>Даланзадгад - Улаанбаатар</option>
                  <option>Шивээхүрэн - Улаанбаатар</option>
                  <option>Гурвантэс - Улаанбаатар</option>
                  <option>Бусад</option>
                </select>
              </Field>
            </div>

            {form.direction === "Бусад" && (
              <Field label="Бусад явах чиглэл *">
                <input
                  required
                  name="otherDirection"
                  value={form.otherDirection}
                  onChange={updateForm}
                  placeholder="Жишээ: Гурвантэс - Даланзадгад"
                />
              </Field>
            )}
          </Section>

          <Section title="Тээврийн хэрэгсэл">
            <Field label="Аялах тээврийн хэрэгсэл *">
              <select
                name="transport"
                value={form.transport}
                onChange={updateForm}
              >
                <option>Байгууллагын унаагаар</option>
                <option>Замын унаа</option>
                <option>АТҮТ / Нийтийн тээвэр</option>
                <option>Бусад</option>
              </select>
            </Field>

            <Field label="Жолоочийн нэр, утасны дугаар">
              <input
                name="driver"
                value={form.driver}
                onChange={updateForm}
                placeholder="Жишээ: Бат 88000000"
              />
            </Field>

            <Field label="Автомашины марк, улсын дугаар">
              <input
                name="vehicle"
                value={form.vehicle}
                onChange={updateForm}
                placeholder="Жишээ: Toyota Land Cruiser 200, 00-00 УБА"
              />
            </Field>
          </Section>

          <Section title={`Зорчих ажилтан (${employees.length})`}>
            <p className="helper">Хамгийн ихдээ 4 ажилтан бүртгэх боломжтой.</p>

            {employees.map((employee, index) => (
              <div className="employeeCard" key={index}>
                <div className="employeeHead">
                  <strong>Ажилтан {index + 1}</strong>
                  {employees.length > 1 && (
                    <button
                      type="button"
                      className="iconBtn danger"
                      onClick={() => removeEmployee(index)}
                      aria-label="Устгах"
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>

                <Field label="Овог нэр *">
                  <input
                    required
                    name="employee-name"
                    value={employee.name}
                    onChange={(e) =>
                      updateEmployee(index, "name", e.target.value)
                    }
                    placeholder="Овог нэр"
                  />
                </Field>

                <div className="twoCols">
                  <Field label="Албан тушаал *">
                    <input
                      required
                      name="employee-position"
                      value={employee.position}
                      onChange={(e) =>
                        updateEmployee(index, "position", e.target.value)
                      }
                      placeholder="Албан тушаал"
                    />
                  </Field>

                  <Field label="Утасны дугаар *">
                    <input
                      required
                      name="employee-phone"
                      value={employee.phone}
                      onChange={(e) =>
                        updateEmployee(index, "phone", e.target.value)
                      }
                      placeholder="Утас"
                    />
                  </Field>
                </div>
              </div>
            ))}

            {employees.length < 4 && (
              <button type="button" className="addBtn" onClick={addEmployee}>
                <Plus size={17} /> Ажилтан нэмэх
              </button>
            )}
          </Section>

          <Section title="Аюулгүй ажиллагааны зааварчилгаа">
            <button
              type="button"
              className="safetyToggle"
              onClick={() => setShowSafety(!showSafety)}
            >
              <span>
                <strong>Зааварчилгаа унших</strong>
                <small>Хувийн аюулгүй байдал, аяллын аюулгүй байдал, хүнсний эрүүл ахуй</small>
              </span>
              {showSafety ? <ChevronUp /> : <ChevronDown />}
            </button>

            {showSafety && (
              <div className="safety">
                <SafetyBlock title="Хувь хүний аюулгүй байдал">
                  <li>Аялалд гарахын өмнө өөрийн эд зүйлсээ шалгах.</li>
                  <li>Эрүүл мэнд, биеийн байдалдаа анхаарах.</li>
                  <li>Шаардлагатай эм, хувийн хэрэгслээ биедээ авч явах.</li>
                  <li>Цаг агаар, нөхцөлдөө тохируулан хувцаслах.</li>
                  <li>Аяллын турш согтууруулах ундаа, сэтгэцэд нөлөөлөх бодис хэрэглэхгүй байх.</li>
                </SafetyBlock>

                <SafetyBlock title="Аяллын аюулгүй байдал">
                  <li>Тээврийн хэрэгслийн бүрэн бүтэн байдлыг шалгах.</li>
                  <li>Суудлын бүсийг тогтмол хэрэглэх.</li>
                  <li>Жолоочийн анхаарлыг сарниулахгүй байх.</li>
                  <li>Тээврийн хэрэгсэл бүрэн зогссоны дараа буух.</li>
                  <li>Аяллын замд зөвшөөрөлгүй бууж үлдэхгүй байх.</li>
                  <li>Жолооч хэт ядарсан бол хөдөлгөөнийг зогсоож, ахлах ажилтанд мэдэгдэх.</li>
                </SafetyBlock>

                <SafetyBlock title="Хүнсний эрүүл ахуй">
                  <li>Хүнсний бүтээгдэхүүний чанар, хугацааг шалгах.</li>
                  <li>Өөрийн эрүүл мэндэд тохирохгүй хүнс хэрэглэхгүй байх.</li>
                  <li>Замд хэрэглэх хүнс, усыг урьдчилан бэлтгэх.</li>
                </SafetyBlock>

                <div className="emergency">
                  <strong>Яаралтай үед холбоо барих</strong>
                  <span>Онцгой байдал: 105</span>
                  <span>Цагдаа: 102</span>
                  <span>Эмнэлэг: 103</span>
                  <span>Байгууллага: 75053443</span>
                </div>
              </div>
            )}

            <div className="signatureBox">
              <div className="signatureHeader">
                <span>Гарын үсэг</span>
                <label className="uploadSignature">
                  <input type="file" accept="image/*" onChange={handleSignatureUpload} />
                  <span>Зураг сонгох</span>
                </label>
              </div>

              {signature ? (
                <img className="signaturePreview" src={signature} alt="Signature preview" />
              ) : (
                <div className="signaturePlaceholder">Гарын үсгийн зураг оруулна уу</div>
              )}
            </div>

            <label className="accept">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                Дээрх шаардлагыг бүрэн уншиж танилцсан, ойлгосон бөгөөд мөрдөхөө зөвшөөрч байна.
              </span>
            </label>
          </Section>

          <div className="submitArea">
            <button className="submitBtn" type="submit" disabled={!accepted || sending}>
              {sending ? "Илгээж байна..." : "Илгээх"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section className="section">
      <div className="sectionTitle">{title}</div>
      <div className="sectionBody">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SafetyBlock({ title, children }) {
  return (
    <div className="safetyBlock">
      <h3>{title}</h3>
      <ol>{children}</ol>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
