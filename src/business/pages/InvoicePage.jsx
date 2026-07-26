import { Link, useParams } from '../router.jsx'
import { ArrowLeft, Printer, CheckCircle2, Leaf } from 'lucide-react'
import { useHubData, gbp, invoiceTotal, updateInvoice } from '../lib/store.js'
import { fmtLong, addDays } from '../lib/dates.js'
import { StatusChip } from '../components/ui.jsx'

// Printable invoice — use the browser's Print → Save as PDF to send to customers.
// Base layout for now; will be restyled to match the user's own template.
export default function InvoicePage() {
  const { id } = useParams()
  const { invoices, settings } = useHubData()
  const invoice = invoices.find((x) => x.id === id)

  if (!invoice) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-slate-500">Invoice not found.</p>
        <Link to="/finance" className="btn-outline rounded-lg">
          <ArrowLeft size={16} /> Back to finance
        </Link>
      </div>
    )
  }

  const total = invoiceTotal(invoice)

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/finance" className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-navy">
          <ArrowLeft size={16} /> Back to finance
        </Link>
        <div className="flex items-center gap-2">
          <StatusChip status={invoice.status} />
          {invoice.status !== 'paid' && (
            <button
              onClick={() => updateInvoice(invoice.id, { status: 'paid' })}
              className="btn-outline rounded-lg !px-4 !py-2 !text-xs"
            >
              <CheckCircle2 size={14} /> Mark paid
            </button>
          )}
          <button onClick={() => window.print()} className="btn-primary rounded-lg !px-4 !py-2 !text-xs">
            <Printer size={14} /> Print / save PDF
          </button>
        </div>
      </div>

      {/* The invoice sheet */}
      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-accent-green">
                <Leaf size={20} />
              </span>
              <span className="font-display text-2xl font-bold text-navy">{settings.businessName || 'Eco Futures'}</span>
            </div>
            {settings.businessAddress && (
              <p className="mt-2 whitespace-pre-line text-sm text-slate-500">{settings.businessAddress}</p>
            )}
            <p className="text-sm text-slate-500">
              {[settings.businessEmail, settings.businessPhone].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-bold uppercase tracking-wide text-slate-300">Invoice</div>
            <div className="mt-1 font-display text-lg font-bold">{invoice.number}</div>
            <div className="text-sm text-slate-500">Issued {fmtLong(invoice.date)}</div>
            <div className="text-sm text-slate-500">Due {fmtLong(addDays(invoice.date, 14))}</div>
          </div>
        </div>

        <div className="mb-8">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Bill to</div>
          <div className="mt-1 text-base font-semibold">{invoice.customerName}</div>
          {invoice.customerAddress && <div className="text-sm text-slate-500">{invoice.customerAddress}</div>}
        </div>

        <table className="mb-8 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-navy text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(invoice.items || []).map((it, i) => (
              <tr key={i}>
                <td className="py-3">{it.description}</td>
                <td className="py-3 text-right">{it.qty}</td>
                <td className="py-3 text-right">{gbp.format(it.unitPrice)}</td>
                <td className="py-3 text-right font-semibold">{gbp.format((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-navy">
              <td colSpan={3} className="py-3 text-right font-display text-base font-bold">Total due</td>
              <td className="py-3 text-right font-display text-xl font-bold text-navy">{gbp.format(total)}</td>
            </tr>
          </tfoot>
        </table>

        {invoice.notes && (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 print:bg-transparent print:p-0">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Notes</div>
            {invoice.notes}
          </div>
        )}

        <p className="mt-10 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
          {settings.businessName || 'Eco Futures'} · Thank you for your business
        </p>
      </div>
    </div>
  )
}
