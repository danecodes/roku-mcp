sub init()
    m.searchInput = m.top.findNode("searchInput")
    m.searchResult = m.top.findNode("searchResult")
    m.searchInput.observeField("text", "onSearchTextChanged")
    m.top.observeField("focusedChild", "onFocusChanged")
end sub

sub onFocusChanged()
    if m.top.hasFocus()
        m.searchInput.setFocus(true)
    end if
end sub

sub onSearchTextChanged(event as object)
    text = event.getData()
    if text <> "" and text <> invalid
        m.searchResult.text = "You searched for: " + text
    else
        m.searchResult.text = ""
    end if
end sub
