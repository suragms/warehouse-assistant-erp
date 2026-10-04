import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import { useAuthStore } from '../stores/authStore';
import { hasPermission } from '../auth/hasPermission';
// Adapted from the reference's static help_guide_page, using the existing web actions/routes.
export default function HelpGuidePage() {
  const user = useAuthStore(s => s.user); const role = user?.currentBusiness?.role;
  const owner = ['Owner', 'Admin', 'SuperAdmin'].includes(role ?? '');
  const guides = [
    { title: 'Home dashboard', titleAr: 'لوحة الرئيسية', permission: undefined, owner: true, steps: ['Review purchases, low stock and pending deliveries.', 'Open a section to see its records.'], stepsAr: ['راجع المشتريات وتنبيهات المخزون والتسليمات المعلقة.', 'افتح القسم لعرض سجلاته.'], route: '/dashboard' },
    { title: 'Add a purchase', titleAr: 'إضافة شراء', permission: 'purchase.create', owner: true, steps: ['Choose the supplier and items.', 'Enter quantities and prices, review the preview, then save.'], stepsAr: ['اختر المورد والأصناف.', 'أدخل الكميات والأسعار، ثم راجع المعاينة قبل الحفظ.'], route: '/purchases/new' },
    { title: 'Barcode lookup', titleAr: 'البحث بالباركود', permission: 'catalog.view', steps: ['Enter the barcode to find its item.', 'Use Scan with camera in supported secure browsers; otherwise enter the code or use a USB scanner.'], stepsAr: ['أدخل الباركود للعثور على الصنف.', 'استخدم الكاميرا في المتصفحات المدعومة أو أدخل الرمز يدوياً.'], route: '/catalog/barcodes' },
    { title: 'Stock', titleAr: 'تحديث المخزون', permission: 'stock.view', steps: ['Open an item to review system and physical stock.', 'Record a physical count when you have stock-edit access.'], stepsAr: ['افتح الصنف لمراجعة مخزون النظام والعدد الفعلي.', 'سجّل العدد الفعلي إذا كانت لديك صلاحية تعديل المخزون.'], route: '/inventory/all' },
    { title: 'Print barcode labels', titleAr: 'طباعة ملصقات', permission: 'catalog.view', owner: true, steps: ['Look up the barcode to open its saved item.', 'Choose Print barcode label / Save PDF and verify the printed code with your scanner.'], stepsAr: ['ابحث عن الباركود لفتح الصنف المحفوظ.', 'اختر طباعة الملصق أو حفظ PDF ثم تحقق من الرمز المطبوع.'], route: '/catalog/barcodes' },
    { title: 'Export & Backup', titleAr: 'النسخ الاحتياطي', permission: 'reports.view', owner: true, steps: ['Download stock Excel, monthly purchase PDF, business JSON or a purchase ZIP.', 'Keep a local copy. Restore validation does not change your data.'], stepsAr: ['نزّل مخزون Excel أو مشتريات الشهر PDF أو نسخة JSON أو مشتريات ZIP.', 'احتفظ بنسخة محلية. التحقق من النسخة الاحتياطية لا يغيّر بياناتك.'], route: '/settings/backup' },
    { title: 'Add staff', titleAr: 'إضافة موظف', permission: 'users.manage', owner: true, steps: ['Open Users and choose Add user.', 'Enter the staff details and select the Staff role.'], stepsAr: ['افتح المستخدمين واختر إضافة مستخدم.', 'أدخل بيانات الموظف واختر دور الموظف.'], route: '/users' },
    { title: 'Receive a delivery', titleAr: 'استلام الشحنة', permission: 'purchase.view', staff: true, steps: ['Open the arriving purchase and check its items.', 'Verify received quantities and report damage when necessary.'], stepsAr: ['افتح الشراء الوارد وتحقق من أصنافه.', 'أكد الكميات المستلمة وأبلغ عن التلف عند الحاجة.'], route: '/purchases/list' },
  ];
  return <div className="space-y-6 min-w-0"><PageHeader title="How to use this app" subtitle="Warehouse Assistant · Harisree Agency warehouse guide" /><Link to="/settings" className="underline inline-block min-h-12">Back to Settings</Link>
    {guides.filter(g => (!g.owner || owner) && (!g.staff || role === 'Staff') && hasPermission(user, g.permission)).map(g => <details key={g.title} className="rounded-xl border bg-white p-4"><summary className="font-semibold cursor-pointer min-h-12">{g.title}</summary><div lang="ar" dir="rtl" className="mb-3 text-sm text-[#475569]"><p className="font-semibold mb-2">{g.titleAr}</p><ol className="list-decimal pr-6 space-y-3">{g.stepsAr.map(step => <li key={step}>{step}</li>)}</ol></div><ol className="list-decimal pl-6 space-y-3">{g.steps.map(step => <li key={step}>{step}</li>)}</ol>{g.route && <Link className="underline inline-block py-3" to={g.route}>Try it · {g.title}</Link>}</details>)}
  </div>;
}
