export interface TableType {
    id?: number,
    ProjectName: string,
    BuyerId?: number,
    BuyerName: string,
    Description?: string,
    SelectionDate: Date,
    Items: number,
    LastUpdated: Date,
    Actions: string,
    section?: string
}