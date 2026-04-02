sub init()
    m.navMenu = m.top.findNode("navMenu")
    m.contentArea = m.top.findNode("contentArea")

    m.screens = {
        home: m.top.findNode("homeScreen"),
        search: m.top.findNode("searchScreen"),
        settings: m.top.findNode("settingsScreen"),
        about: m.top.findNode("aboutScreen"),
        deeplink: m.top.findNode("deepLinkScreen")
    }

    m.navMenu.observeField("selectedItem", "onNavSelection")
    m.top.observeField("deepLinkContentId", "onDeepLink")
    m.currentScreenKey = "home"

    ' Focus the home screen content area
    m.screens.home.setFocus(true)
end sub

sub onDeepLink(event as object)
    contentId = event.getData()
    if contentId = "" or contentId = invalid then return

    ' Show deep link screen
    for each key in m.screens
        m.screens[key].visible = false
    end for
    m.screens.deeplink.visible = true
    m.screens.deeplink.contentId = contentId
    m.screens.deeplink.mediaType = m.top.deepLinkMediaType
    m.currentScreenKey = "deeplink"
    m.top.currentScreen = "deeplink"
    m.screens.deeplink.setFocus(true)
end sub

sub onNavSelection(event as object)
    selected = event.getData()
    if selected = "" then return

    ' Hide all screens
    for each key in m.screens
        m.screens[key].visible = false
    end for

    ' Show selected screen
    if m.screens[selected] <> invalid
        m.screens[selected].visible = true
        m.currentScreenKey = selected
        m.top.currentScreen = selected
    end if

    ' Hide nav menu and focus the content
    m.navMenu.visible = false
    m.screens[m.currentScreenKey].setFocus(true)
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false

    if key = "left"
        if not m.navMenu.visible
            m.navMenu.visible = true
            m.navMenu.setFocus(true)
            return true
        end if
    end if

    if key = "right"
        if m.navMenu.visible
            m.navMenu.visible = false
            m.screens[m.currentScreenKey].setFocus(true)
            return true
        end if
    end if

    return false
end function
