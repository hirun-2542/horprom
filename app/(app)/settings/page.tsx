import { getDorm, updateDormAction } from "@/app/actions";

export default async function SettingsPage() {
  const dorm = await getDorm();

  const inputClass =
    "w-full rounded-lg border border-sand px-3 py-2 text-sm focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500";
  const labelClass = "mb-1 block text-sm font-medium text-teak-800";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-teak-950">ตั้งค่า</h1>

      <form action={updateDormAction} className="space-y-6">
        <div className="rounded-2xl border border-sand bg-white shadow-sm p-5">
          <h2 className="mb-4 text-base font-semibold text-teak-950">ข้อมูลหอพัก</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>ชื่อหอพัก</label>
              <input type="text" name="name" required defaultValue={dorm.name} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>ที่อยู่</label>
              <textarea name="address" rows={3} defaultValue={dorm.address ?? ""} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-sand bg-white shadow-sm p-5">
          <h2 className="mb-4 text-base font-semibold text-teak-950">บัญชีรับเงิน</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>พร้อมเพย์ (PromptPay)</label>
              <input
                type="text"
                name="promptpay_id"
                defaultValue={dorm.promptpay_id ?? ""}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-stone-400">เบอร์โทร หรือ เลขบัตรประชาชน สำหรับสร้าง QR</p>
            </div>
            <div>
              <label className={labelClass}>ธนาคาร</label>
              <input type="text" name="bank_name" defaultValue={dorm.bank_name ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>เลขบัญชี</label>
              <input
                type="text"
                name="bank_account_no"
                defaultValue={dorm.bank_account_no ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ชื่อบัญชี</label>
              <input
                type="text"
                name="bank_account_name"
                defaultValue={dorm.bank_account_name ?? ""}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-sand bg-white shadow-sm p-5">
          <h2 className="mb-4 text-base font-semibold text-teak-950">อัตราค่าบริการ</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>ค่าน้ำ (บาท/หน่วย)</label>
              <input
                type="number"
                name="water_rate"
                step="0.01"
                min="0"
                defaultValue={dorm.water_rate}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ค่าไฟ (บาท/หน่วย)</label>
              <input
                type="number"
                name="electric_rate"
                step="0.01"
                min="0"
                defaultValue={dorm.electric_rate}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ค่าส่วนกลาง</label>
              <input
                type="number"
                name="service_fee"
                step="0.01"
                min="0"
                defaultValue={dorm.service_fee}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ค่าขยะ</label>
              <input
                type="number"
                name="trash_fee"
                step="0.01"
                min="0"
                defaultValue={dorm.trash_fee}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ค่าไวไฟ</label>
              <input
                type="number"
                name="wifi_fee"
                step="0.01"
                min="0"
                defaultValue={dorm.wifi_fee}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>กำหนดชำระภายใน (วัน)</label>
              <input
                type="number"
                name="due_in_days"
                step="1"
                min="0"
                defaultValue={dorm.due_in_days}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-marigold-700 px-5 py-2 text-sm font-medium text-white hover:bg-teak-800"
        >
          บันทึก
        </button>
      </form>
    </div>
  );
}
