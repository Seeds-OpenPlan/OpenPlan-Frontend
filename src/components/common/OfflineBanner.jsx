import { useEffect, useRef } from 'react'
import { Banner } from './Banner'
import { WifiOffIcon } from './statusIcons'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { toast } from '../../hooks/useToasts'
import { systemMessages } from '../../constants/systemMessages'

/*
  PTN-OFFLINE (ui-spec §7). Shows a non-dismissible sticky banner while offline
  and fires a recovery toast when the connection returns. Save buttons across the
  app disable themselves via the store's canWrite selector (fed by the same
  useOnlineStatus hook) — this component owns only the banner + recovery toast.

  The recovery toast fires only on an actual offline→online transition, not on
  first mount while already online, so a normal load never shows it.
*/
export function OfflineBanner() {
  const online = useOnlineStatus()
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!online) {
      wasOffline.current = true
    } else if (wasOffline.current) {
      // Transitioned back online after having been offline → recovery toast.
      wasOffline.current = false
      toast({ tone: 'success', message: systemMessages.offline.recoveredToast })
    }
  }, [online])

  if (online) return null

  return (
    <Banner
      tone="warning"
      icon={<WifiOffIcon size={18} />}
      message={systemMessages.offline.banner}
      dismissible={false}
      sticky
    />
  )
}

export default OfflineBanner
