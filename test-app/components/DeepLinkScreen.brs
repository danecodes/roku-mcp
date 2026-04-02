sub init()
    m.contentIdLabel = m.top.findNode("contentIdLabel")
    m.mediaTypeLabel = m.top.findNode("mediaTypeLabel")
    m.top.observeField("contentId", "onContentChanged")
    m.top.observeField("mediaType", "onContentChanged")
end sub

sub onContentChanged()
    m.contentIdLabel.text = "contentId: " + m.top.contentId
    if m.top.mediaType <> "" and m.top.mediaType <> invalid
        m.mediaTypeLabel.text = "mediaType: " + m.top.mediaType
    else
        m.mediaTypeLabel.text = ""
    end if
end sub
