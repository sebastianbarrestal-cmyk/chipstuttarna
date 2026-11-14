let state
let demo = false
let nativeLogin = false
let registrationMode = 'open'
let adminData
let pollsData = []
let officerData
let officerPollResults = {polls:[],next:null}
let filter = 'all'
let adminSection = 'accounts'
let accountSearch = ''
let officerSection = 'followup'
let officerHistory = false
let openRaid = 'barrow-deeps'
let priorityItem

const setState = value => { state = value }
const setDemo = value => { demo = value }
const setAuthConfig = config => { nativeLogin = config.native; registrationMode = config.mode }
const setAdminData = value => { adminData = value }
const setPollsData = value => { pollsData = value }
const setOfficerData = value => { officerData = value }
const setOfficerPollResults = value => { officerPollResults = value }
const setFilter = value => { filter = value }
const setAdminSection = value => { adminSection = value }
const setAccountSearch = value => { accountSearch = value }
const setOfficerSection = value => { officerSection = value }
const setOfficerHistory = value => { officerHistory = value }
const setOpenRaid = value => { openRaid = value }
const setPriorityItem = value => { priorityItem = value }

const officer = () => ['owner','admin','officer'].includes(state?.user?.role)
const canManageEvent = event => officer() || event.created_by === state.user?.id
const administrator = () => ['owner','admin'].includes(state?.user?.role)
const canPublishOfficial = () => administrator() || (officer() && state.officialSettings?.creator_role !== 'admin')
const activeTab = () => location.hash.slice(1).split('/')[0] || 'events'

export { state, demo, nativeLogin, registrationMode, adminData, pollsData, officerData, officerPollResults, filter, adminSection, accountSearch, officerSection, officerHistory, openRaid, priorityItem, setState, setDemo, setAuthConfig, setAdminData, setPollsData, setOfficerData, setOfficerPollResults, setFilter, setAdminSection, setAccountSearch, setOfficerSection, setOfficerHistory, setOpenRaid, setPriorityItem, officer, administrator, canManageEvent, canPublishOfficial, activeTab }
