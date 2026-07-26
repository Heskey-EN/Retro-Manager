// The signed-in user's active organisation, held at module level so plain
// stores (jobsStore) can stamp org_id on writes without threading React
// context through every call. Written by useAuth when the membership loads.
let currentOrgId = null

export const setActiveOrgId = (orgId) => {
  currentOrgId = orgId || null
}

export const getActiveOrgId = () => currentOrgId
