function cleanTimeLine(response, params){
    return response.data.map(timeline => {
     if(timeline.event == 'commented'){
            return {
                'issue_id': params.repo + params.issue_number,
                'id': timeline.id,
                'event': timeline.event,
                'event_created_at': new Date(timeline.created_at),
                'user': timeline.user ? '@' + timeline.user.login : null,
                'body': `${timeline.body}`,
                
            }
        }
        return null   
    })
    .filter(item => item !== null);
}

function cleanIssue(issue){
    return {
        'issue_id':issue.repository.name + issue.number,
        'title': issue.title,
        'labels': issue.labels.nodes.map(label => label.name),
        'assignees': issue.assignees.nodes ? issue.assignees.nodes.map(assignees => '@'+assignees.login) : null,
        'createdAt': new Date(issue.createdAt),
        'closedAt': new Date(issue.createdAt),
        'daysOpen': issue.closedAt == null ? calculateDaysOpen(issue.createdAt) : calculateDaysOpen(issue.createdAt, issue.closedAt)
    };
}

function calculateDaysOpen(creationString, closedString){
    let dateAux;
    
    const creationDate = new Date(creationString).valueOf();

    if(closedString == null){
        dateAux = Date.now();
    } else {
        dateAux = new Date(closedString).valueOf();
    }

    return ((dateAux - creationDate)/86400000).toFixed(0);
}

export default { cleanTimeLine, cleanIssue };