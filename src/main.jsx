import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  Building2,
  Bus,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Ellipsis,
  PhoneCall,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X
} from "lucide-react";
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

const initialForm = {
  company: "Говьхангайн Хөдөлмөр ХХК",
  department: "",
  travelDate: "",
  direction: "",
  otherDirection: "",
  transport: "Байгууллагын унаагаар",
  driverName: "",
  driverPhone: "",
  vehicleModel: "",
  vehiclePlate: ""
};

const transportOptions = [
  { value: "Байгууллагын унаагаар", label: "Байгууллагын унаа", icon: Building2 },
  { value: "Замын унаа", label: "Замын унаа", icon: Car },
  { value: "АТҮТ / Нийтийн тээвэр", label: "АТҮТ / Нийтийн", icon: Bus },
  { value: "Бусад", label: "Бусад", icon: Ellipsis }
];

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
  const [toast, setToast] = useState("");

  const [form, setForm] = useState(initialForm);

  const needsVehicleDetails = form.transport !== "АТҮТ / Нийтийн тээвэр";

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const steps = [
    {
      id: "basic",
      title: "Үндсэн мэдээлэл",
      icon: ClipboardList,
      done:
        Boolean(form.department && form.travelDate && form.direction) &&
        (form.direction !== "Бусад" || Boolean(form.otherDirection.trim()))
    },
    {
      id: "transport",
      title: "Тээврийн хэрэгсэл",
      icon: Car,
      done:
        Boolean(form.transport) &&
        (!needsVehicleDetails ||
          Boolean(
            form.driverName.trim() &&
              form.driverPhone.trim() &&
              form.vehicleModel.trim() &&
              form.vehiclePlate.trim()
          ))
    },
    {
      id: "employees",
      title: "Зорчих ажилтан",
      icon: Users,
      done: employees.every(
        (employee) => employee.name.trim() && employee.position.trim() && employee.phone.trim()
      )
    },
    {
      id: "safety",
      title: "Зааварчилгаа ба гарын үсэг",
      icon: ShieldCheck,
      done: Boolean(signature && accepted)
    }
  ];

  const doneCount = steps.filter((step) => step.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);

  const updateForm = (e) => {
    const { name, value } = e.target;
    let nextValue = value;
    if (name === "driverName") nextValue = value.replace(/[^\p{L}\p{M} ]/gu, "");
    if (name === "driverPhone") nextValue = value.replace(/[^0-9]/g, "");
    if (name === "vehiclePlate") nextValue = value.toUpperCase();
    setForm((previous) => ({ ...previous, [name]: nextValue }));
  };

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

  const scrollToStep = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e) => {
    e.preventDefault();

    if (sending) return;

    const missing = [];

    if (needsVehicleDetails) {
      if (!form.driverName.trim()) missing.push("Жолоочийн нэр");
      if (!form.driverPhone.trim()) missing.push("Жолоочийн утасны дугаар");
      if (!form.vehicleModel.trim()) missing.push("Автомашины марк");
      if (!form.vehiclePlate.trim()) missing.push("Автомашины улсын дугаар");
    }

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
      setToast(`Дутуу байна: ${missing[0]}`);
      const firstIncomplete = steps.find((step) => !step.done);
      if (firstIncomplete) scrollToStep(firstIncomplete.id);
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
          form: {
            ...form,
            driverName: needsVehicleDetails ? form.driverName.trim() : "",
            driverPhone: needsVehicleDetails ? form.driverPhone : "",
            vehicleModel: needsVehicleDetails ? form.vehicleModel.trim() : "",
            vehiclePlate: needsVehicleDetails ? form.vehiclePlate.trim() : "",
            driver: needsVehicleDetails ? [form.driverName.trim(), form.driverPhone].filter(Boolean).join(" ") : "",
            vehicle: needsVehicleDetails ? [form.vehicleModel.trim(), form.vehiclePlate.trim()].filter(Boolean).join(", ") : ""
          },
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
      setForm(initialForm);
      setShowSafety(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setToast(error.message || "Илгээхэд асуудал гарлаа. Та дахин оролдоно уу.");
    } finally {
      setSending(false);
    }
  };

  const handleSignatureUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      setSignature(await readScaledImage(file));
    } catch {
      setToast("Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.");
    }
  };

  if (submitted) {
    return (
      <div className="app">
        <AppBar company={form.company} />
        <main className="successPage">
          <div className="successCard">
            <div className="successIcon">
              <CheckCircle2 size={40} strokeWidth={2.2} />
            </div>
            <h2>Амжилттай илгээгдлээ</h2>
            <p>Аяллын мэдээлэл бүртгэгдлээ. Аюулгүй аялаарай!</p>
            <button type="button" className="btn btnPrimary" onClick={() => setSubmitted(false)}>
              <RotateCcw size={18} /> Шинэ маягт бөглөх
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <AppBar company={form.company} progress={progress} />

      <div className="layout">
        <aside className="sidebar">
          <div className="sideCard">
            <div className="sideProgressHead">
              <span>Явц</span>
              <strong>
                {doneCount}/{steps.length}
              </strong>
            </div>
            <div className="progressTrack">
              <div className="progressFill" style={{ width: `${progress}%` }} />
            </div>
            <nav className="stepNav">
              {steps.map((step, index) => (
                <button
                  type="button"
                  key={step.id}
                  className={`stepLink ${step.done ? "isDone" : ""}`}
                  onClick={() => scrollToStep(step.id)}
                >
                  <span className="stepBadge">
                    {step.done ? <Check size={14} strokeWidth={3} /> : index + 1}
                  </span>
                  <span>{step.title}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="sideCard">
            <div className="emergencyHead">
              <PhoneCall size={16} /> Яаралтай үед
            </div>
            <EmergencyList />
          </div>
        </aside>

        <main className="content">
          <header className="hero">
            <div className="heroLogo">
              <CompanyLogo companyName={form.company} />
            </div>
            <div className="heroText">
              <span className="eyebrow">Аюулгүй ажиллагаа</span>
              <h1>АТҮТ болон замын унаагаар зорчих үеийн аюулгүй ажиллагааны зааварчилгаа</h1>
              <div className="meta">
                <span>Хувилбар: 03</span>
                <span>Шинэчилсэн огноо: 2026.09.01</span>
              </div>
            </div>
          </header>

          <form id="travelForm" onSubmit={submit}>
            <Section step={steps[0]} number={1}>
              <div className="field">
                <span>Компани</span>
                <div className="companyGrid" role="radiogroup" aria-label="Компани">
                  {companyOptions.map((company) => (
                    <label
                      key={company.value}
                      className={`companyTile ${form.company === company.value ? "isSelected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="company"
                        value={company.value}
                        checked={form.company === company.value}
                        onChange={updateForm}
                      />
                      <span className="companyTileLogo">
                        <img src={company.logo} alt="" draggable="false" />
                      </span>
                      <span className="companyTileName">{company.value}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Field label="Харьяалагдах хэлтэс" required>
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
                <Field label="Аялах өдөр" required>
                  <input
                    required
                    type="date"
                    name="travelDate"
                    value={form.travelDate}
                    onChange={updateForm}
                  />
                </Field>

                <Field label="Аялах чиглэл" required>
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
                    <option>Цагаанхад - Улаанбаатар</option>
                    <option>Шивээхүрэн - Улаанбаатар</option>
                    <option>Гурвантэс - Улаанбаатар</option>
                    <option>Бусад</option>
                  </select>
                </Field>
              </div>

              {form.direction === "Бусад" && (
                <Field label="Бусад явах чиглэл" required>
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

            <Section step={steps[1]} number={2}>
              <div className="field">
                <span>
                  Аялах тээврийн хэрэгсэл<em className="req"> *</em>
                </span>
                <div className="segmented" role="radiogroup" aria-label="Аялах тээврийн хэрэгсэл">
                  {transportOptions.map(({ value, label, icon: Icon }) => (
                    <label
                      key={value}
                      className={`segment ${form.transport === value ? "isSelected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="transport"
                        value={value}
                        checked={form.transport === value}
                        onChange={updateForm}
                      />
                      <Icon size={20} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {needsVehicleDetails && (
                <>
                  <div className="twoCols">
                    <Field label="Жолоочийн нэр" required>
                      <input
                        required
                        name="driverName"
                        value={form.driverName}
                        onChange={updateForm}
                        pattern={".*\\p{L}.*"}
                        title="Нэрээ үсгээр оруулна уу."
                        placeholder="Жишээ: Бат"
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Жолоочийн утасны дугаар" required>
                      <input
                        required
                        type="tel"
                        inputMode="numeric"
                        name="driverPhone"
                        value={form.driverPhone}
                        onChange={updateForm}
                        pattern="[0-9]+"
                        title="Утасны дугаараа зөвхөн тоогоор оруулна уу."
                        placeholder="Жишээ: 88000000"
                      />
                    </Field>
                  </div>

                  <div className="twoCols">
                    <Field label="Автомашины марк" required>
                      <input
                        required
                        name="vehicleModel"
                        value={form.vehicleModel}
                        onChange={updateForm}
                        placeholder="Жишээ: Toyota Land Cruiser 200"
                      />
                    </Field>
                    <Field label="Автомашины улсын дугаар" required>
                      <input
                        required
                        name="vehiclePlate"
                        value={form.vehiclePlate}
                        onChange={updateForm}
                        pattern={"[0-9]{2}\\-?[0-9]{2} *[A-ZА-ЯӨҮЁ]{3}"}
                        title="4 тоо, 3 үсэг оруулна уу. Жишээ: 1234 УБА эсвэл 12-34 УБА"
                        placeholder="Жишээ: 1234 УБА"
                        autoCapitalize="characters"
                      />
                    </Field>
                  </div>
                </>
              )}
            </Section>

            <Section
              step={steps[2]}
              number={3}
              aside={<span className="countPill">{employees.length}/4</span>}
            >
              <p className="helper">Хамгийн ихдээ 4 ажилтан бүртгэх боломжтой.</p>

              {employees.map((employee, index) => (
                <div className="employeeCard" key={index}>
                  <div className="employeeHead">
                    <span className="employeeAvatar">{index + 1}</span>
                    <strong>Ажилтан {index + 1}</strong>
                    {employees.length > 1 && (
                      <button
                        type="button"
                        className="iconBtn"
                        onClick={() => removeEmployee(index)}
                        aria-label="Устгах"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>

                  <Field label="Овог нэр" required>
                    <input
                      required
                      name="employee-name"
                      value={employee.name}
                      onChange={(e) => updateEmployee(index, "name", e.target.value)}
                      placeholder="Овог нэр"
                    />
                  </Field>

                  <div className="twoCols">
                    <Field label="Албан тушаал" required>
                      <input
                        required
                        name="employee-position"
                        value={employee.position}
                        onChange={(e) => updateEmployee(index, "position", e.target.value)}
                        placeholder="Албан тушаал"
                      />
                    </Field>

                    <Field label="Утасны дугаар" required>
                      <input
                        required
                        type="tel"
                        name="employee-phone"
                        value={employee.phone}
                        onChange={(e) => updateEmployee(index, "phone", e.target.value)}
                        placeholder="Утас"
                      />
                    </Field>
                  </div>
                </div>
              ))}

              {employees.length < 4 && (
                <button type="button" className="addBtn" onClick={addEmployee}>
                  <Plus size={18} /> Ажилтан нэмэх
                </button>
              )}
            </Section>

            <Section step={steps[3]} number={4}>
              <button
                type="button"
                className={`safetyToggle ${showSafety ? "isOpen" : ""}`}
                onClick={() => setShowSafety(!showSafety)}
                aria-expanded={showSafety}
              >
                <span className="safetyToggleIcon">
                  <ShieldCheck size={22} />
                </span>
                <span className="safetyToggleText">
                  <strong>Зааварчилгаа унших</strong>
                  <small>Хувийн аюулгүй байдал, аяллын аюулгүй байдал, хүнсний эрүүл ахуй</small>
                </span>
                <ChevronDown className="chevron" size={20} />
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
                    <strong>
                      <PhoneCall size={15} /> Яаралтай үед холбоо барих
                    </strong>
                    <EmergencyList />
                  </div>
                </div>
              )}

              <div className="signatureBox">
                <div className="signatureHeader">
                  <span>
                    Гарын үсэг<em className="req"> *</em>
                  </span>
                  {signature && (
                    <button type="button" className="linkBtn" onClick={() => setSignature("")}>
                      <X size={15} /> Арилгах
                    </button>
                  )}
                </div>

                <label className={`signatureDrop ${signature ? "hasImage" : ""}`}>
                  <input type="file" accept="image/*" onChange={handleSignatureUpload} />
                  {signature ? (
                    <img className="signaturePreview" src={signature} alt="Гарын үсэг" />
                  ) : (
                    <span className="signaturePlaceholder">
                      <Upload size={22} />
                      <strong>Гарын үсгийн зураг оруулах</strong>
                      <small>Зураг авах эсвэл файл сонгоно уу</small>
                    </span>
                  )}
                </label>
              </div>

              <label className={`accept ${accepted ? "isChecked" : ""}`}>
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span className="checkBox" aria-hidden="true">
                  <Check size={14} strokeWidth={3.2} />
                </span>
                <span>
                  Дээрх шаардлагыг бүрэн уншиж танилцсан, ойлгосон бөгөөд мөрдөхөө зөвшөөрч байна.
                </span>
              </label>
            </Section>
          </form>

          <div className="actionBar">
            <div className="actionStatus">
              <strong>
                {doneCount}/{steps.length} алхам
              </strong>
              <span>{doneCount === steps.length ? "Илгээхэд бэлэн" : "Бүх хэсгийг бөглөнө үү"}</span>
            </div>
            <button
              className="btn btnPrimary submitBtn"
              type="submit"
              form="travelForm"
              disabled={!accepted || sending}
            >
              {sending ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Илгээж байна...
                </>
              ) : (
                "Илгээх"
              )}
            </button>
          </div>
        </main>
      </div>

      {toast && (
        <div className="toast" role="alert">
          <AlertCircle size={18} />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast("")} aria-label="Хаах">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function AppBar({ company, progress }) {
  return (
    <header className="appBar">
      <div className="appBarInner">
        <div className="appBarLogo">
          <CompanyLogo companyName={company} />
        </div>
        <div className="appBarText">
          <strong>Аяллын зааварчилгаа</strong>
          <span>{company}</span>
        </div>
        {progress !== undefined && <span className="appBarPct">{progress}%</span>}
      </div>
      {progress !== undefined && (
        <div className="appBarProgress">
          <div className="progressFill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </header>
  );
}

function Section({ step, number, aside, children }) {
  const Icon = step.icon;

  return (
    <section className="section" id={step.id}>
      <div className="sectionHead">
        <span className={`sectionIcon ${step.done ? "isDone" : ""}`}>
          {step.done ? <Check size={18} strokeWidth={3} /> : <Icon size={18} />}
        </span>
        <div className="sectionTitle">
          <small>Алхам {number}</small>
          <h2>{step.title}</h2>
        </div>
        {aside}
      </div>
      <div className="sectionBody">{children}</div>
    </section>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <em className="req"> *</em>}
      </span>
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

function EmergencyList() {
  return (
    <div className="emergencyList">
      <a href="tel:105">
        <span>Онцгой байдал</span>
        <strong>105</strong>
      </a>
      <a href="tel:102">
        <span>Цагдаа</span>
        <strong>102</strong>
      </a>
      <a href="tel:103">
        <span>Эмнэлэг</span>
        <strong>103</strong>
      </a>
      <a href="tel:75053443">
        <span>Байгууллага</span>
        <strong>75053443</strong>
      </a>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
