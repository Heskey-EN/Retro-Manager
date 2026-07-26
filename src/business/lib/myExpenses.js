// Worker-side expense logging (suite mode only). Levels 1–2 with the
// per-account "can add expenses" permission insert rows into biz_expenses
// and read back their own — RLS enforces exactly that (insert your own row
// only if permitted; read your own rows; no update/delete below level 3).
import { supabase } from './supabaseClient.js'
import { getActiveOrgId } from '../../lib/orgContext.js'

export async function fetchMyExpenses(userId) {
  const { data, error } = await supabase
    .from('biz_expenses')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function submitMyExpense(userId, { date, category, description, amount }) {
  const { data, error } = await supabase
    .from('biz_expenses')
    .insert({
      org_id: getActiveOrgId(),
      user_id: userId,
      date,
      category,
      description,
      amount: Number(amount) || 0,
      account: 'business',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}
