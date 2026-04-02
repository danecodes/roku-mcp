sub init()
    m.settingsList = m.top.findNode("settingsList")
    m.top.observeField("focusedChild", "onFocusChanged")

    content = CreateObject("roSGNode", "ContentNode")
    items = ["Enable notifications", "Auto-play next episode", "Show subtitles"]

    for each item in items
        child = content.createChild("ContentNode")
        child.title = item
    end for

    m.settingsList.content = content
end sub

sub onFocusChanged()
    if m.top.hasFocus()
        m.settingsList.setFocus(true)
    end if
end sub
