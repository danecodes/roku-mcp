sub init()
    m.menuList = m.top.findNode("menuList")

    ' Build menu content
    content = CreateObject("roSGNode", "ContentNode")
    items = ["Home", "Search", "Settings", "About"]
    ids = ["home", "search", "settings", "about"]

    for i = 0 to items.count() - 1
        item = content.createChild("ContentNode")
        item.title = items[i]
        item.id = ids[i]
    end for

    m.menuList.content = content
    m.menuList.observeField("itemSelected", "onItemSelected")
    m.top.observeField("visible", "onVisibleChanged")
end sub

sub onVisibleChanged(event as object)
    if event.getData() = true
        m.menuList.jumpToItem = 0
        m.menuList.setFocus(true)
    end if
end sub

sub onItemSelected(event as object)
    index = event.getData()
    ids = ["home", "search", "settings", "about"]
    if index >= 0 and index < ids.count()
        m.top.selectedItem = ids[index]
    end if
end sub
